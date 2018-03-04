# homebridge-ir-raw-sender

Homebridge plugin to send ir raw signals from remotes using pigpio

# Installation

Not available yet.

homebridge-ir-raw-sender uses pigpio-client lib which require to run as root.
It also uses node-persist to make the values persist between sessions.

# Configuration

Configuration example:
```
{

	"accessories": [
		{
			"accessory": "IRSender",
			"name": "Air Cond",
			"pin": 22
		},
		{
			"accessory": "GPIODevice",
			"name": "Sofa Light",
			"type": "Lightbulb",
			"pin": 5
		},
		{
			"accessory": "GPIODevice",
			"type": "MotionSensor",
			"name": "Hall Motion",
			"pin": 3,
			"occupancy": {
				"name": "Home Occupancy",
				"timeout": 3600
			}
		},
		{
			"accessory": "GPIODevice",
			"name": "Kitchen Roller Shutter",
			"type": "WindowCovering",
			"pins": [12,13]
			"shiftDuration": 23,
			"initPosition": 99
		},
		{
			"accessory": "GPIODevice",
			"type": "LockMechanism",
			"name": "Front Door",
			"pin": 6,
			"duration": 5
		}
	],

	"platforms":[]
}
```
