// Central notification library for use across the app
export interface NotificationRow {
  description: string;
  type: string;
  availability: string;
  eventId?: string;
}

export const notificationEventIds: Record<string, string> = {
  "Harsh Cornering": "29622",
  "Harsh Left Cornering": "29620",
  "Harsh Right Cornering": "29621",
  "Ignition Off": "29601",
  "Ignition On": "29600",
  "Low Battery": "29605",
  "Low Internal Battery": "29606",
  "Panic Alert": "29635"
};

const rawNotifications = `
* Assistance Request|Default|
* Assistance Request Cancelled|Default|
* Diagnostic: Internal Battery Capacity|Default|
* Diagnostic: Internal Battery Voltage|Default|
* Diagnostic: Vehicle Battery Voltage|Default|
* Door Closed|Default|
* Door Opened|Default|
* Harsh Cornering|System|Available
* Harsh Left Cornering|Default|
* Harsh Right Cornering|Default|
* Ignition Off|Default|Available
* Ignition On|Default|Available
* Impact Detect Moderate|System|Not available - Missing parameters
* Impact Detect Severe|System|Not available - Missing parameters
* Input 1 High|System|Available
* Input 1 Low|System|Available
* Input 2 High|System|Available
* Input 2 Low|System|Available
* Low Battery|Default|Available
* Low Internal Battery|Default|Available
* Low Remote Control Battery|Default|
* OBC unit reset|Default|
* Panic Alert|Default|Available
* Panic Alert Cancelled|Default|
* Power Disconnected|Default|Available
* Power Reconnected|Default|Available
* PTO Disengaged|Default|
* PTO Engaged|Default|
* Road Speed Limit Exceeded|Default|
3-Axis - Lift Off|Default|
3-Axis - Possible Accident|Default|
3-Axis - Rollover|Default|
3-Axis - Rough Road|Default|
3-Axis – Harsh Cornering|Default|
Active Control - plug identification prevented|System|
Active Control - positive drive OFF|System|
Active Control - positive drive ON|System|
Active Control - relay drive 1 OFF|System|
Active Control - relay drive 1 ON|System|
Active Control - relay drive 2 OFF|System|
Active Control - relay drive 2 ON|System|
Active fuel source changed|Diagnostic|
Active fuel source on PTO change|Diagnostic|
Active Message: Trailer A Connect|System|Not available - Missing parameters
Active Message: Trailer A Disconnect|System|Not available - Missing parameters
Active Message: Trailer B Connect|System|Not available - Missing parameters
Active Message: Trailer B Disconnect|System|Not available - Missing parameters
Active Message: Trailer C Connect|System|Not available - Missing parameters
Active Message: Trailer C Disconnect|System|Not available - Missing parameters
Active Message: Trailer D Connect|System|Not available - Missing parameters
Active Message: Trailer D Disconnect|System|Not available - Missing parameters
Alarm Button Pressed|System|
Alarm: 12V battery voltage low|Diagnostic|
Alarm: 24V battery voltage low|Diagnostic|
Alarm: Battery Disconnect (Power Down)|Diagnostic|
Alarm: Dash Tamper|Diagnostic|Not available - Missing parameters
Alarm: No Go RSA Border|Diagnostic|
Alarm: Panic Pressed|Diagnostic|Not available - Missing parameters
Alert: No Driver Identified|Diagnostic|
Alert: No GPRS Coverage for 30 min|Diagnostic|Not available - Missing parameters
Alert: Possible Accident|Diagnostic|
Alert: Possible CAN Tamper|Diagnostic|
Alert: Possible Power Tamper|Diagnostic|
Alert: Possible Speed Spike|Diagnostic|
Analog measurement threshold violation|External|
Asset Towed|External|Available
Back panel tamper detected|Diagnostic|
Backup battery disconnected|Diagnostic|
Backup battery faulty|Diagnostic|
Backup battery low|Diagnostic|
Battery disconnected|System|
Battery disconnection|System|
Battery status changed|Diagnostic|
Battery voltage - Connection diagnostic|System|
Button 1 Pressed|System|
Button 2 Pressed|System|
Button 3 Pressed|System|
Calculate soft clock current date time using calculated time|Default|Available
Calculate soft clock value when after the time change date|Default|Available
Calculate soft clock value when before the time change date|Default|Available
CAN loss detected|Diagnostic|Available
CAN speed/RPM loss detected|Diagnostic|Available
Coasting detection|External|
Cold Chain - Cold Chain broken|System|Not available - Missing parameters
Cold Chain - Cooling unit not efficient|System|Not available - Missing parameters
Cold Chain - Cooling unit off while driving|System|Not available - Missing parameters
Cold Chain - Door open too long|System|Not available - Missing parameters
Configuration accepted|Default|Available
Configuration loss detected|Diagnostic|
Configuration rolled back|System|
Configuration version changed|Default|Available
Coolant Level Low|External|Not available - Missing parameters
DEF Level Low|External|Not available - Missing parameters
DI: Driving without blue driver key|Diagnostic|
DI: RS Exception|Diagnostic|
Diagnostic trouble code|System|Available
Diagnostic: Bat Fault: ChargingCountAndTime|Diagnostic|
Diagnostic: Bat Fault: Disconnected|Diagnostic|
Diagnostic: Bat Fault: FullCountAndTime|Diagnostic|
Diagnostic: Bat Fault: ParkTimeAndCount|Diagnostic|
Diagnostic: Bat Fault: RippleVoltage|Diagnostic|
Diagnostic: Bat Fault: UnableToAddCharge|Diagnostic|
Diagnostic: CAN Scan|Diagnostic|Available
Diagnostic: Communication heartbeat|Default|
Diagnostic: Fault no Engine RPM|Diagnostic|
Diagnostic: Fault no GPS|Diagnostic|
Diagnostic: GPS velocity as speed fallback|System|
Diagnostic: GPS Velocity At 50km/h Road Speed|Diagnostic|
Diagnostic: Maximum GPS Velocity|Diagnostic|
Diagnostic: Vivi Display Disconnected|Diagnostic|Not available - Missing parameters
Diagnostic: No GPRS Coverage|Diagnostic|
Diagnostic: No GSM Coverage|Diagnostic|
Diagnostic: Noise on speed line|Diagnostic|
Diagnostic: OBC temperature exceeded 55 deg C|Diagnostic|
Diagnostic: OBC temperature exceeded 60 deg C|Diagnostic|
Diagnostic: OBC temperature exceeded 70 deg C|Diagnostic|
Diagnostic: OBC temperature exceeded 80 deg C|Diagnostic|
Diagnostic: Road Speed At 50 km/h GPS Velocity|Diagnostic|
Diagnostic: Rovi II disconnected|Diagnostic|Not available - Missing parameters
Diagnostic: Rovi II fault detected|Diagnostic|
Diagnostic: Rovi III disconnected|Diagnostic|Not available - Missing parameters
Diagnostic: Rovi III fault detected|Diagnostic|
Diagnostic: Rovi IV disconnected|Diagnostic|Not available - Missing parameters
Diagnostic: Rovi IV fault detected|Diagnostic|
Diagnostic: Satellite communication heartbeat|Default|
Diagnostic: Satellite communication message limit increase|Default|
Diagnostic: Satellite communication message limit reset|Default|
Diagnostic: Satellite communication message limit set|Default|Available
Diesel Particulate Filter Soot Load High|External|Not available - Missing parameters
Display diagnostic: AUTO DRIVING|Diagnostic|Not available - Missing parameters
Display diagnostic: AUTO ON DUTY NOT DRIVING|Diagnostic|Not available - Missing parameters
Display diagnostic: COMMUTE MODE|Diagnostic|Not available - Missing parameters
Display diagnostic: DRIVING|Diagnostic|Not available - Missing parameters
Display diagnostic: INVALID COMPANY ID ON USB DRIVE|Diagnostic|Not available - Missing parameters
Display diagnostic: INVALID USB DRIVE|Diagnostic|Not available - Missing parameters
Display diagnostic: Logged off / leave vehicle|Diagnostic|Not available - Missing parameters
Display diagnostic: Logged onto vehicle|Diagnostic|Not available - Missing parameters
Display diagnostic: NO ACTIVE DRIVER|Diagnostic|Not available - Missing parameters
Display diagnostic: OFF AT WELL|Diagnostic|Not available - Missing parameters
Display diagnostic: OFF DUTY|Diagnostic|Not available - Missing parameters
Display diagnostic: ON DUTY NOT DRIVING|Diagnostic|Not available - Missing parameters
Display diagnostic: SLEEPER BIRTH|Diagnostic|Not available - Missing parameters
Display diagnostic: STANDBY / WAITING|Diagnostic|Not available - Missing parameters
DriveMate Mode Change|Default|Available
Driver Assist - Bluetooth Remote|Default|Available
Driver Authenticated|External|
Driver door open|System|Available
Driver fatigue critical|System|Not available - Missing parameters
Driver fatigue warning|System|Not available - Missing parameters
Driver Lock-out|External|
Driver Lock-out Override|External|
Driver plug from incorrect organisation|System|
Driver seatbelt not engaged|System|Available
Driver side rear door open|System|Available
Driving Without Authentication|External|
Dutch Tax Reporting Trip Mode|System|Not available - Missing parameters
DVR Error detected|Diagnostic|Not available - Missing parameters
ELVIST continuous driving limit exceeded|System|Not available - Missing parameters
ELVIST daily driving limit exceeded|System|Not available - Missing parameters
Emergency alert button|System|Not available - Missing parameters
End of trip fuel tank level percentage|System|Available
End of trip state of charge|System|Available
Energy consumed (Total)|External|
Energy recuperated (Total)|External|
Engine coolant temperature high|System|Available
Engine Coolant Temperature High 2|External|
Engine light (MIL) on|System|Available
Engine Oil level low|System|Available
Engine Oil Pressure low|System|Available
Engine Temperature|External|Not available - Missing parameters
Entered NoGoZone - [Zone Name]|System|
EV CAN: Charger Status|External|Not available - Missing parameters
Exceeding 4 Hours Driving With Out 30 mins Rest|System|
Excessive idle|External|Available
Extended Trip - Cruise control on|System|Not available - Missing parameters
Extended Trip - Drive|System|
Extended Trip - Green Band|System|
Extended Trip - PTO active|System|Not available - Missing parameters
Extended Trip - Top Gear|System|
External Battery Back To Normal|External|
External Battery Low|External|
Firmware error|Default|Available
Firmware info|Default|Available
Firmware version changed|Default|Available
FM Average trip axle weight|System|Not available - Missing parameters
FM Axel weight high|System|Not available - Missing parameters
FM Brake pedal depressed|System|Not available - Missing parameters
FM Clutch disengaged|System|Not available - Missing parameters
FM Clutch overload detected|System|Not available - Missing parameters
FM Cold rev limiter|System|Not available - Missing parameters
FM distance remaining until next service|System|
FM Free wheel in neutral|System|
FM Fuel level percentage|System|
FM High engine temperature|System|Not available - Missing parameters
FM High resolution vehicle odometer|System|Not available - Missing parameters
FM Impact - X axis force|System|Not available - Missing parameters
FM Impact - Y axis force|System|Not available - Missing parameters
FM Keypad driving reason|System|Not available - Missing parameters
FM Low coolant|System|Not available - Missing parameters
FM Low oil level detected|System|Not available - Missing parameters
FM Low oil pressure (linear of RPM)|System|Not available - Missing parameters
FM Low oil pressure detected|System|Not available - Missing parameters
FM Oil wire off|System|Not available - Missing parameters
FM PTO engaged|System|
FM PTO violation|System|
FM Retarder engaged|System|
FM System relay bypassed|System|
FM TCO driving|System|
FM TCO overspeed detected|System|
FM TCO reversing|System|
FM Temperature wire off|System|Not available - Missing parameters
FM Total engine hours|System|
Free Wheeling|System|
Frequency measurement threshold violation|External|
Front panel tamper detected|Diagnostic|
Fuel level difference|Default|Not available - Missing parameters
Fuel Level Low|External|Not available - Missing parameters
Fuel Level Low 2|External|
Fuel Syphoning|External|
Geofence hotspot violation|External|
GPRS - Session active|System|
GPRS - Total bytes received|System|
GPRS - Total bytes sent|System|
GPRS - Total bytes sent and received|System|
GPRS - Total sessions|System|
GPS antenna disconnected|Diagnostic|
GPS jamming|Diagnostic|
GSM Modem in use by SDK|System|
GSM supervision rollover detected|Default|
Harsh acceleration|System|Available
Harsh Acceleration (excessive)|System|
Harsh acceleration - WARNING|System|
Harsh braking|System|Available
Harsh Braking (excessive)|System|
Harsh braking - WARNING|System|
Idle|System|Available
Idle - excessive|System|Available
Idle - excessive - WARNING|System|
IFTA PTO Engaged|System|
Impact Detect|External|Available
In-cab road speed over speeding|Default|Available
In-cab road speed over speeding - EXCESSIVE DURATION|Default|Available
In-cab road speed over speeding - EXCESSIVE SPEED|Default|Available
Input 1 Active|External|
Input 1 Inactive|External|
Input 2 Active|External|
Input 2 Inactive|External|
Internal Battery excessive ripple voltage|System|
Internal Battery excessive trickle charge time|System|
Internal Battery Low|External|Not available - Missing parameters
Jamming Detect|External|Available
Kimax axle 1 overweight|System|Not available - Missing parameters
Kimax axle 2 overweight|System|Not available - Missing parameters
Kimax axle 3 overweight|System|Not available - Missing parameters
Kimax axle 4 overweight|System|Not available - Missing parameters
Kimax axle 5 overweight|System|Not available - Missing parameters
Kimax axle 6 overweight|System|Not available - Missing parameters
Kimax moved tonnage|Default|Not available - Missing parameters
Kimax total load overweight|System|Not available - Missing parameters
Kimax total payload overweight|System|Not available - Missing parameters
Kimax tractor payload overweight|System|Not available - Missing parameters
Kimax tractor total load overweight|System|Not available - Missing parameters
Kimax trailer payload overweight|System|Not available - Missing parameters
Kimax trailer total load overweight|System|Not available - Missing parameters
Last TrailerID Connected|Default|Not available - Missing parameters
LoadTech Axle 1 GROSS|System|Not available - Missing parameters
LoadTech Axle 1 NETT|System|Not available - Missing parameters
LoadTech Axle 2 GROSS|System|Not available - Missing parameters
LoadTech Axle 2 NETT|System|Not available - Missing parameters
LoadTech Axle 3 GROSS|System|Not available - Missing parameters
LoadTech Axle 3 NETT|System|Not available - Missing parameters
LoadTech Total GROSS|System|Not available - Missing parameters
LoadTech Total NETT|System|Not available - Missing parameters
Low battery|External|
Low Battery - Bluetooth Remote|Diagnostic|Available
Low Battery Level|External|
Man Down|System|
Vivi Rovi Mini: High Engine Temperature Error|Diagnostic|
Vivi Rovi Mini: High Engine Temperature Warning|Diagnostic|
Vivi Rovi Mini: Low Battery Voltage Error|Diagnostic|Not available - Missing parameters
Vivi Rovi Mini: Low Battery Voltage Warning|Diagnostic|Not available - Missing parameters
Vivi Rovi Mini: Low Coolant Level Error|Diagnostic|Not available - Missing parameters
Vivi Rovi Mini: Low Coolant Level Warning|Diagnostic|Not available - Missing parameters
Vivi Rovi Mini: Low Oil Level Error|Diagnostic|
Vivi Rovi Mini: Low Oil Level Warning|Diagnostic|
Vivi Rovi Mini: Low Oil Pressure Error|Diagnostic|
Vivi Rovi Mini: Low Oil Pressure Warning|Diagnostic|
Vivi Rovi Mini: SRV Brake Air Pressure Error|Diagnostic|Not available - Missing parameters
Vivi Rovi Mini: SRV Brake Air Pressure Warning|Diagnostic|Not available - Missing parameters
Ai: Blind spot detection (front)|Ai|
Ai: Blind spot detection (left)|Ai|
Ai: Blind spot detection (right)|Ai|
Ai: Driver distraction|Ai|
Ai: Driver fatigue - eye closing|Ai|
Ai: Driver fatigue - yawning|Ai|
Ai: Driver not wearing seatbelt|Ai|
Ai: Driver smoking|Ai|
Ai: End of Trip Video|System|
Ai: Event video requests capped|Diagnostic|
Ai: Face to Driver ID mismatch|Ai|
Ai: Following distance warning|Ai|
Ai: Forward collision warning|Ai|
Ai: GPS loss|Ai|
Ai: Impact detection|Ai|
Ai: IO1|Ai|
Ai: IO2|Ai|
Ai: IO3|Ai|
Ai: IO4|Ai|
Ai: IO5|Ai|
Ai: IO6|Ai|
Ai: IO7|Ai|
Ai: IO8|Ai|
Ai: Lane departure warning|Ai|
Ai: Lens covered|Ai|
Ai: Low voltage|Ai|
Ai: Manual alert|Ai|
Ai: Mobile phone distraction|Ai|
Ai: Motion detection|Ai|
Ai: No driver|Ai|
Ai: Pedestrian collision warning|Ai|
Ai: Power loss|Ai|
Ai: Rolling stop|Ai|
Ai: Safeguard extremely high risk|Default|
Ai: Safeguard high risk|Default|
Ai: Safeguard low risk|Default|
Ai: Safeguard medium risk|Default|
Ai: Speed sign overspeeding|Ai|
Ai: Start of Trip Video|System|
Ai: Storage exception|Ai|
Ai: Video loss|Ai|
Mobile phone use|System|Not available - Missing parameters
Movement in Reverse Gear|External|Not available - Missing parameters
Night Driving Time|System|
No modem zone entry|External|
OBC unit date changed|Default|Available
OBC unit Engine Hours changed|Default|Available
OBC unit odometer changed|Default|Available
OBC unit reset|Default|Available
Observability: State of Charge|External|
Oil Temperature|External|Not available - Missing parameters
Out of green band driving|System|Available
Over revving|System|Available
Over revving - WARNING|System|
Over speeding|System|Available
Over Speeding (excessive)|System|
Over speeding - WARNING|System|
Over speeding in location|Default|Available
Over speeding in location - EXCESSIVE DURATION|Default|Available
Over speeding in location - EXCESSIVE SPEED|Default|Available
Over Speeding Pre-Warning|Custom|Available
Overtime driving|System|
Passenger door open|System|Available
Passenger IDed|Default|Available
Passenger plug notification|System|
Passenger seatbelt not engaged|System|Available
Passenger side rear door open|System|Available
Possible GPS jamming|Diagnostic|
Possible impact|System|Available
Possible impact when parked|System|Available
Possible Rollover|System|Available
Power Connected|Diagnostic|
Power Disconnect|External|Available
Power Event Off|System|
Power Event On|System|
Power Reconnect|External|Available
Private Mode|System|Not available - Missing parameters
Private mode plug active|System|
Record trip Driver picture|Default|
Remote Ignition OFF|Default|
Remote Ignition ON|Default|
Road Speed Overspeeding|Default|Available
Roaming|External|
Rovi - Route Cancellation|System|Not available - Missing parameters
Rovi - Route Recalculation|System|Not available - Missing parameters
Rovi III - Route Cancellation|System|Not available - Missing parameters
Rovi III - Route Recalculation|System|Not available - Missing parameters
Rovi IV - Route Cancellation|System|Not available - Missing parameters
Rovi IV - Route Recalculation|System|Not available - Missing parameters
Rovi: Auto Driving|Custom|Not available - Missing parameters
Rovi: Auto On Duty not Driving|Custom|Not available - Missing parameters
Rovi: Commute Mode (personal conveyance)|Custom|Not available - Missing parameters
Rovi: Driving|Custom|Not available - Missing parameters
Rovi: No Active Driver|Custom|Not available - Missing parameters
Rovi: Off Duty|Custom|Not available - Missing parameters
Rovi: Off Duty at Well|Custom|Not available - Missing parameters
Rovi: On Duty not Driving|Custom|Not available - Missing parameters
Rovi: Sleeper Berth|Custom|Not available - Missing parameters
RPM calibrated (calibration plug)|Default|
Serial TCO Driver 1 4.5 hours WARNING|System|Not available - Missing parameters
Serial TCO Driver 1 Card IN|System|Not available - Missing parameters
Serial TCO Driver 1 Card OUT|System|Not available - Missing parameters
Serial TCO Driver 1 Driving WITHOUT Card|System|Not available - Missing parameters
Serial TCO OVERSPEED|System|Not available - Missing parameters
Settings version changed|Default|Available
Speed calibrated (calibration plug)|Default|
Speed calibrated (from GPS velocity)|Default|
Speed detected during ignition off|External|
Speed sender disconnected|Diagnostic|
Speeding - On-board tiered|Default|Available
Speeding - Tiered|Default|
Start of trip fuel tank level percentage|System|Available
Start of trip state of charge|System|Available
Store new values for time deviation calculation|Default|Available
Stored fuel level|Default|Not available - Missing parameters
Sub-trip end|Default|Available
Sub-trip start|Default|Available
Swap Unit function executed|Default|
System overridden|System|
Tamper detected|External|
TCO door not opened in 24 hours|System|Not available - Missing parameters
TCO door open / DTCO no card inserted|System|Not available - Missing parameters
TCO driver 1 active work|System|Not available - Missing parameters
TCO driver 1 driving|System|Not available - Missing parameters
TCO driver 1 ID change|System|Not available - Missing parameters
TCO driver 1 passive work|System|Not available - Missing parameters
TCO driver 1 resting|System|Not available - Missing parameters
TCO driver 2 active work|System|Not available - Missing parameters
TCO driver 2 ID change|System|Not available - Missing parameters
TCO driver 2 passive work|System|Not available - Missing parameters
TCO driver 2 resting|System|Not available - Missing parameters
TCO no signal (assume door open)|System|Not available - Missing parameters
Trailer A|System|Not available - Missing parameters
Trailer B|System|Not available - Missing parameters
Trailer C|System|Not available - Missing parameters
Trailer D|System|Not available - Missing parameters
Transmission Switch OFF|System|Not available - Missing parameters
Trip End|Default|
Trip Number reset to 0|Default|
Trip Start|Default|
WLAN - Session active|System|
`;

export const notificationRows: NotificationRow[] = rawNotifications
  .trim()
  .split("\n")
  .map((line) => {
    const [description, type, availability = ""] = line.split("|").map((part) => part.trim());
    return { description, type, availability };
  });
