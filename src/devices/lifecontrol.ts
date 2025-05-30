import * as exposes from "../lib/exposes";
import * as m from "../lib/modernExtend";
import * as globalStore from "../lib/store";
import type {Configure, DefinitionWithExtend, Expose, Fz, ModernExtend, OnEvent} from "../lib/types";

const e = exposes.presets;

function airQuality(): ModernExtend {
    const exposes: Expose[] = [e.temperature(), e.humidity(), e.voc().withUnit("ppb"), e.eco2()];

    const fromZigbee: Fz.Converter[] = [
        {
            cluster: "msTemperatureMeasurement",
            type: ["attributeReport", "readResponse"],
            convert: (model, msg, publish, options, meta) => {
                const temperature = Number.parseFloat(msg.data.measuredValue) / 100.0;
                const humidity = Number.parseFloat(msg.data.minMeasuredValue) / 100.0;
                const eco2 = Number.parseFloat(msg.data.maxMeasuredValue);
                const voc = Number.parseFloat(msg.data.tolerance);
                return {temperature, humidity, eco2, voc};
            },
        },
    ];

    return {exposes, fromZigbee, isModernExtend: true};
}

function electricityMeterPoll(): ModernExtend {
    const configure: Configure[] = [
        m.setupConfigureForBinding("haElectricalMeasurement", "input"),
        m.setupConfigureForReading("haElectricalMeasurement", [
            "acVoltageMultiplier",
            "acVoltageDivisor",
            "acCurrentMultiplier",
            "acCurrentDivisor",
            "acPowerMultiplier",
            "acPowerDivisor",
        ]),
        m.setupConfigureForReading("seMetering", ["multiplier", "divisor"]),
        m.setupConfigureForReporting("seMetering", "currentSummDelivered", {
            config: {min: "5_SECONDS", max: "1_HOUR", change: 257},
            access: exposes.access.STATE_GET,
        }),
    ];

    const onEvent: OnEvent[] = [
        (type, data, device) => {
            // This device doesn't support reporting correctly.
            // https://github.com/Koenkk/zigbee-herdsman-converters/pull/1270
            const endpoint = device.getEndpoint(1);
            if (type === "stop") {
                clearInterval(globalStore.getValue(device, "interval"));
                globalStore.clearValue(device, "interval");
            } else if (!globalStore.hasValue(device, "interval")) {
                const interval = setInterval(async () => {
                    try {
                        await endpoint.read("haElectricalMeasurement", ["rmsVoltage", "rmsCurrent", "activePower"]);
                        await endpoint.read("seMetering", ["currentSummDelivered", "multiplier", "divisor"]);
                    } catch {
                        // Do nothing
                    }
                }, 10 * 1000); // Every 10 seconds
                globalStore.putValue(device, "interval", interval);
            }
        },
    ];

    return {configure, onEvent, isModernExtend: true};
}

export const definitions: DefinitionWithExtend[] = [
    {
        zigbeeModel: ["Leak_Sensor"],
        model: "MCLH-07",
        vendor: "LifeControl",
        description: "Water leakage sensor",
        extend: [
            m.iasZoneAlarm({zoneType: "water_leak", zoneAttributes: ["alarm_1", "tamper", "battery_low"]}),
            m.battery({dontDividePercentage: true, percentageReporting: false}),
        ],
    },
    {
        zigbeeModel: ["Door_Sensor"],
        model: "MCLH-04",
        vendor: "LifeControl",
        description: "Open and close sensor",
        extend: [
            m.iasZoneAlarm({zoneType: "contact", zoneAttributes: ["alarm_1", "tamper", "battery_low"]}),
            m.battery({dontDividePercentage: true, percentageReporting: false}),
        ],
    },
    {
        zigbeeModel: ["vivi ZLight"],
        model: "MCLH-02",
        vendor: "LifeControl",
        description: "Smart light bulb",
        extend: [m.light({colorTemp: {range: [167, 333]}, color: true})],
    },
    {
        zigbeeModel: ["RICI01"],
        model: "MCLH-03",
        vendor: "LifeControl",
        description: "Smart socket",
        extend: [m.onOff({powerOnBehavior: false}), m.electricityMeter({configureReporting: false}), electricityMeterPoll()],
    },
    {
        zigbeeModel: ["Motion_Sensor"],
        model: "MCLH-05",
        vendor: "LifeControl",
        description: "Motion sensor",
        extend: [
            m.iasZoneAlarm({zoneType: "occupancy", zoneAttributes: ["alarm_1", "tamper", "battery_low"]}),
            m.battery({dontDividePercentage: true, percentageReporting: false}),
        ],
    },
    {
        zigbeeModel: ["VOC_Sensor"],
        model: "MCLH-08",
        vendor: "LifeControl",
        description: "Air quality sensor",
        extend: [airQuality(), m.battery({dontDividePercentage: true, percentageReporting: false})],
    },
];
