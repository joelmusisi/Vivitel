/**
 * CMSV6 / 808 GPS Web API catalog (Active Security Cloud Platform).
 * Source: http://host:8080/808gps/open/webApi.html
 *
 * Every documented clause is listed so the app can drive the platform
 * without operators opening the vendor UI.
 */

export type Cmsv6Param = {
  name: string;
  required?: boolean;
  description: string;
};

export type Cmsv6Endpoint = {
  id: string;
  group: string;
  title: string;
  kind: "action" | "player" | "media";
  action: string;
  method: "GET" | "POST";
  requiresSession: boolean;
  params: Cmsv6Param[];
};

const jsession: Cmsv6Param = { name: "jsession", required: true, description: "Session returned by login" };
const devIdno: Cmsv6Param = { name: "devIdno", required: true, description: "Device number" };
const vehiIdno: Cmsv6Param = { name: "vehiIdno", required: true, description: "Vehicle / plate number" };
const page: Cmsv6Param[] = [
  { name: "currentPage", description: "Page number (1-based)" },
  { name: "pageRecords", description: "Rows per page" }
];
const timeRange: Cmsv6Param[] = [
  { name: "begintime", required: true, description: "Start time yyyy-MM-dd HH:mm:ss" },
  { name: "endtime", required: true, description: "End time yyyy-MM-dd HH:mm:ss" }
];
const toMap: Cmsv6Param = { name: "toMap", description: "Map type: 1 Google, 2 WGS84, 3 Baidu, 4 Gaode" };

export const CMSV6_ENDPOINTS: Cmsv6Endpoint[] = [
  { id: "login", group: "Login And Logout", title: "Login", kind: "action", action: "StandardApiAction_login", method: "GET", requiresSession: false, params: [
    { name: "account", required: true, description: "Platform account" },
    { name: "password", required: true, description: "Platform password" }
  ]},
  { id: "loginEx", group: "Login And Logout", title: "Login (JSONP)", kind: "action", action: "StandardApiAction_loginEx", method: "GET", requiresSession: false, params: [
    { name: "account", required: true, description: "Platform account" },
    { name: "password", required: true, description: "Platform password" },
    { name: "callback", description: "JSONP callback" }
  ]},
  { id: "logout", group: "Login And Logout", title: "Logout", kind: "action", action: "StandardApiAction_logout", method: "GET", requiresSession: true, params: [jsession] },

  { id: "queryUserVehicle", group: "Query Vehicle", title: "Get User Vehicle", kind: "action", action: "StandardApiAction_queryUserVehicle", method: "GET", requiresSession: true, params: [jsession, { name: "language", description: "zh / en" }] },
  { id: "getDeviceByVehicle", group: "Query Vehicle", title: "Get DevIdno", kind: "action", action: "StandardApiAction_getDeviceByVehicle", method: "GET", requiresSession: true, params: [jsession, vehiIdno] },
  { id: "getDeviceOlStatus", group: "Query Vehicle", title: "Get Device Online", kind: "action", action: "StandardApiAction_getDeviceOlStatus", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", description: "Device number, comma separated" }] },
  { id: "getDeviceStatus", group: "Query Vehicle", title: "Get Device Status(GPS)", kind: "action", action: "StandardApiAction_getDeviceStatus", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", required: true, description: "Device number, comma separated" }, toMap, { name: "language", description: "zh / en" }] },
  { id: "queryTrackDetail", group: "Query Vehicle", title: "Get Device Track", kind: "action", action: "StandardApiAction_queryTrackDetail", method: "GET", requiresSession: true, params: [jsession, devIdno, ...timeRange, { name: "distance", description: "Min distance filter" }, { name: "parkTime", description: "Park time seconds" }, ...page, toMap] },
  { id: "queryAlarmDetail", group: "Query Vehicle", title: "Get Device Alarm(Page)", kind: "action", action: "StandardApiAction_queryAlarmDetail", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", description: "Device number" }, ...timeRange, { name: "armType", description: "Alarm types comma separated" }, { name: "handle", description: "0 unhandled 1 handled" }, ...page, toMap] },
  { id: "vehicleAlarm", group: "Query Vehicle", title: "Acquiring device real time alarm", kind: "action", action: "StandardApiAction_vehicleAlarm", method: "GET", requiresSession: true, params: [jsession, { name: "DevIDNO", required: true, description: "Device number" }, toMap] },
  { id: "runMileage", group: "Query Vehicle", title: "Vehicle Mileage", kind: "action", action: "StandardApiAction_runMileage", method: "GET", requiresSession: true, params: [jsession, vehiIdno, { name: "begintime", required: true, description: "yyyy-MM-dd" }, { name: "endtime", required: true, description: "yyyy-MM-dd" }, ...page] },
  { id: "parkDetail", group: "Query Vehicle", title: "Vehicle Parked", kind: "action", action: "StandardApiAction_parkDetail", method: "GET", requiresSession: true, params: [jsession, vehiIdno, ...timeRange, { name: "parkTime", description: "Park seconds" }, toMap, ...page] },
  { id: "vehicleStatus", group: "Query Vehicle", title: "Vehicle Latest Location", kind: "action", action: "StandardApiAction_vehicleStatus", method: "GET", requiresSession: true, params: [jsession, vehiIdno, toMap, ...page, { name: "geoaddress", description: "0 skip reverse geocode" }] },
  { id: "getOilTrackDetail", group: "Query Vehicle", title: "Mileage Details Report", kind: "action", action: "StandardApiAction_getOilTrackDetail", method: "GET", requiresSession: true, params: [jsession, vehiIdno, ...timeRange, toMap, ...page] },
  { id: "queryAccessAreaInfo", group: "Query Vehicle", title: "Detailed information of access area", kind: "action", action: "StandardApiAction_queryAccessAreaInfo", method: "GET", requiresSession: true, params: [jsession, vehiIdno, ...timeRange, toMap, ...page] },

  { id: "livePlayerHtml", group: "Video Business", title: "Live Video(PC/mobile URL)", kind: "player", action: "808gps/open/player/video.html", method: "GET", requiresSession: false, params: [
    { name: "jsession", description: "Session or use account/password" },
    { name: "account", description: "Account if no jsession" },
    { name: "password", description: "Password if no jsession" },
    { name: "devIdno", description: "Device number" },
    { name: "vehiIdno", description: "Plate number if no devIdno" },
    { name: "channel", description: "Windows / channels, max 9" },
    { name: "stream", description: "0 main 1 sub" },
    { name: "close", description: "Auto-close seconds" },
    { name: "lang", description: "en / zh" }
  ]},
  { id: "liveHlsPage", group: "Video Business", title: "Real Time Video (Mobile WEB HLS page)", kind: "player", action: "808gps/open/hls/index.html", method: "GET", requiresSession: false, params: [
    { name: "jsession", description: "Session or use account/password" },
    { name: "account", description: "Account" },
    { name: "password", description: "Password" },
    { name: "devIdno", description: "Device number" },
    { name: "vehiIdno", description: "Plate number" },
    { name: "channel", description: "Channel from 0" },
    { name: "lang", description: "en / zh" }
  ]},
  { id: "liveHlsMedia", group: "Video Business", title: "Real Time Video (Mobile WEB HLS live address)", kind: "media", action: "hls/{requestType}_{devIdno}_{channel}_{stream}.m3u8", method: "GET", requiresSession: true, params: [
    jsession,
    { name: "devIdno", required: true, description: "Device number" },
    { name: "channel", required: true, description: "Channel from 0" },
    { name: "stream", description: "0 main 1 sub" }
  ]},
  { id: "liveRtsp", group: "Video Business", title: "RealTime Video RTSP", kind: "media", action: "rtsp://{mediaHost}:{mediaPort}/3/3", method: "GET", requiresSession: true, params: [
    { name: "AVType", required: true, description: "1 live 2 monitor" }, jsession,
    { name: "DevIDNO", required: true, description: "Device number" },
    { name: "Channel", required: true, description: "Channel from 0" },
    { name: "Stream", description: "0 main 1 sub" }
  ]},
  { id: "liveFlv", group: "Video Business", title: "RealTime Video RTMP(FLV)", kind: "media", action: "http://{mediaHost}:{mediaPort}/3/3", method: "GET", requiresSession: true, params: [
    { name: "AVType", required: true, description: "1 live 2 monitor" }, jsession,
    { name: "DevIDNO", required: true, description: "Device number" },
    { name: "Channel", required: true, description: "Channel from 0" },
    { name: "Stream", description: "0 main 1 sub" }
  ]},
  { id: "liveRtmp", group: "Video Business", title: "RealTime Video RTMP", kind: "media", action: "rtmp://{mediaHost}:{mediaPort}/3/3", method: "GET", requiresSession: true, params: [
    { name: "AVType", required: true, description: "1 live" }, jsession,
    { name: "DevIDNO", required: true, description: "Device number" },
    { name: "Channel", required: true, description: "Channel from 0" },
    { name: "Stream", description: "0 main 1 sub" }
  ]},
  { id: "realPlayPage", group: "Video Business", title: "Live Video RealPlay page", kind: "player", action: "808gps/open/player/RealPlayVideo.html", method: "GET", requiresSession: false, params: [
    { name: "jsession", description: "Session" }, { name: "account", description: "Account" }, { name: "password", description: "Password" },
    { name: "PlateNum", description: "Plate number" }, { name: "lang", description: "en / zh" }
  ]},
  { id: "gpsMapPage", group: "Query Vehicle", title: "Vehicle GPS map", kind: "player", action: "808gps/open/map/vehicleMap.html", method: "GET", requiresSession: false, params: [
    { name: "account", description: "Account" }, { name: "password", description: "Password" }, { name: "devIdno", description: "Device number" }
  ]},
  { id: "trackReplayPage", group: "Query Vehicle", title: "Track replay page", kind: "player", action: "808gps/open/trackReplay/Track.html", method: "GET", requiresSession: true, params: [
    jsession, vehiIdno, { name: "begintime", description: "yyyy-MM-dd" }
  ]},

  { id: "realTimeVedio", group: "File related business", title: "RealTime Video", kind: "action", action: "StandardApiAction_realTimeVedio", method: "GET", requiresSession: true, params: [jsession, { name: "DevIDNO", required: true, description: "Device number" }, { name: "Chn", description: "Channel" }, { name: "Sec", description: "Seconds" }, { name: "Label", description: "Label" }] },
  { id: "getVideoFileInfo", group: "File related business", title: "Query Video", kind: "action", action: "StandardApiAction_getVideoFileInfo", method: "GET", requiresSession: true, params: [
    { name: "DevIDNO", required: true, description: "Device number" }, { name: "LOC", description: "1 device 2 server" },
    { name: "CHN", description: "Channel 0=all" }, { name: "YEAR", required: true, description: "Year" },
    { name: "MON", required: true, description: "Month" }, { name: "DAY", required: true, description: "Day" }
  ]},
  { id: "getVideoHistoryFile", group: "File related business", title: "Query Video（Cross Day）", kind: "action", action: "StandardApiAction_getVideoHistoryFile", method: "GET", requiresSession: true, params: [
    { name: "DevIDNO", required: true, description: "Device number" }, { name: "LOC", description: "1 device 2 server" },
    { name: "CHN", description: "Channel" }, { name: "YEAR", required: true, description: "Year" },
    { name: "MON", required: true, description: "Month" }, { name: "DAY", description: "Day" }
  ]},
  { id: "addDownloadTask", group: "File related business", title: "Download Video", kind: "action", action: "StandardApiAction_addDownloadTask", method: "GET", requiresSession: true, params: [
    jsession, { name: "did", required: true, description: "Device number" },
    { name: "fbtm", required: true, description: "File begin time" }, { name: "fetm", required: true, description: "File end time" },
    { name: "sbtm", description: "Select begin" }, { name: "setm", description: "Select end" },
    { name: "lab", description: "Label" }, { name: "fph", description: "File path" },
    { name: "vtp", description: "Video type" }, { name: "len", description: "Length" },
    { name: "chn", description: "Channel" }, { name: "dtp", description: "Download type" }
  ]},
  { id: "playbackPage", group: "File related business", title: "Remote Playback（PC/mobile）", kind: "player", action: "808gps/open/player/PlayBackVideo.html", method: "GET", requiresSession: false, params: [
    { name: "account", description: "Account" }, { name: "password", description: "Password" }, { name: "PlateNum", description: "Plate" }, { name: "lang", description: "en / zh" }
  ]},
  { id: "capturePicture", group: "File related business", title: "Img Capture", kind: "action", action: "StandardApiAction_capturePicture", method: "GET", requiresSession: true, params: [
    jsession, { name: "Type", description: "Capture type" }, { name: "Resolution", description: "Resolution" },
    { name: "DevIDNO", required: true, description: "Device number" }, { name: "Chn", required: true, description: "Channel" }
  ]},
  { id: "downloadTasklist", group: "File related business", title: "Subsection Download Task", kind: "action", action: "StandardApiAction_downloadTasklist", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", description: "Device" }, { name: "status", description: "Task status" }, { name: "taskTag", description: "Tag" }, ...timeRange, ...page] },
  { id: "delDownloadTasklist", group: "File related business", title: "Delete Device Download the subsection task", kind: "action", action: "StandardApiAction_delDownloadTasklist", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", required: true, description: "Device" }, { name: "taskTag", description: "Tag" }] },
  { id: "addMediaInformation", group: "File related business", title: "Insert Video Audio Picture Record", kind: "action", action: "StandardApiAction_addMediaInformation", method: "GET", requiresSession: true, params: [
    jsession, { name: "devIdno", required: true, description: "Device" }, { name: "channel", description: "Channel" },
    { name: "mediaType", description: "Media type" }, { name: "fileType", description: "File type" },
    { name: "filePath", required: true, description: "File path" }, { name: "fileOffset", description: "Offset" },
    { name: "fileSize", description: "Size" }, { name: "fileSTime", description: "Start" }, { name: "fileETime", description: "End" },
    { name: "Label", description: "Label" }, { name: "svrIDNO", description: "Server id" }
  ]},
  { id: "ftpUpload", group: "File related business", title: "FTP File Upload", kind: "action", action: "StandardApiAction_ftpUpload", method: "GET", requiresSession: true, params: [
    jsession, { name: "DevIDNO", required: true, description: "Device" }, { name: "CHN", description: "Channel" },
    { name: "BEGYEAR", required: true, description: "Begin year" }, { name: "BEGMON", required: true, description: "Begin month" },
    { name: "BEGDAY", required: true, description: "Begin day" }, { name: "BEGSEC", description: "Begin sec of day" },
    { name: "ENDYEAR", required: true, description: "End year" }, { name: "ENDMON", required: true, description: "End month" },
    { name: "ENDDAY", required: true, description: "End day" }, { name: "ENDSEC", description: "End sec of day" },
    { name: "STREAM", description: "0 main 1 sub" }, { name: "STORE", description: "Storage" }, { name: "NETMASK", description: "Network mask" }
  ]},
  { id: "queryFtpStatus", group: "File related business", title: "FTP Task Status Query", kind: "action", action: "StandardApiAction_queryFtpStatus", method: "GET", requiresSession: true, params: [jsession, { name: "seq", description: "Sequence" }, { name: "devIdno", required: true, description: "Device" }] },
  { id: "queryDownLoadReplayEx", group: "File related business", title: "FTP Task List Query", kind: "action", action: "StandardApiAction_queryDownLoadReplayEx", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", required: true, description: "Device" }, { name: "status", description: "Status" }, ...timeRange, ...page] },
  { id: "controllDownLoad", group: "File related business", title: "FTP Upload Control", kind: "action", action: "StandardApiAction_controllDownLoad", method: "GET", requiresSession: true, params: [jsession, { name: "seq", required: true, description: "Sequence" }, { name: "devIdno", required: true, description: "Device" }, { name: "taskType", description: "0 pause 1 resume 2 cancel" }] },

  { id: "performanceReportPhotoListSafe", group: "Active Safety Business", title: "Security Alarm Inquiry", kind: "action", action: "StandardApiAction_performanceReportPhotoListSafe", method: "GET", requiresSession: true, params: [jsession, ...timeRange, { name: "alarmType", description: "ADAS/DMS type" }, { name: "mediaType", description: "0 image 1 video" }, toMap, { name: "vehiIdno", description: "Plate" }, ...page] },
  { id: "alarmEvidence", group: "Active Safety Business", title: "Security Evidence Inquiry", kind: "action", action: "StandardApiAction_alarmEvidence", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", required: true, description: "Device" }, { name: "guid", required: true, description: "Alarm guid" }, { name: "alarmType", description: "Type" }, { name: "begintime", required: true, description: "Alarm time" }, toMap] },
  { id: "zipAlarmEvidence", group: "Active Safety Business", title: "Evidence Query", kind: "action", action: "StandardApiAction_zipAlarmEvidence", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", required: true, description: "Device" }, { name: "guid", required: true, description: "Alarm guid" }, { name: "alarmType", description: "Type" }, { name: "begintime", required: true, description: "Alarm time" }, toMap] },

  { id: "userMediaRateOfFlow", group: "Video 1078 Business", title: "User media traffic query", kind: "action", action: "StandardApiAction_userMediaRateOfFlow", method: "GET", requiresSession: true, params: [jsession, { name: "userIds", description: "User ids" }, { name: "type", description: "Traffic types" }, ...timeRange, ...page] },
  { id: "catalogSummaryApi", group: "Video 1078 Business", title: "Resource Catalog Summary", kind: "action", action: "StandardApiAction_catalogSummaryApi", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", required: true, description: "Device" }, { name: "alarmSourceType", description: "0,1" }, ...timeRange, ...page] },
  { id: "catalogDetailApi", group: "Video 1078 Business", title: "Resource Catalog Detail", kind: "action", action: "StandardApiAction_catalogDetailApi", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", required: true, description: "Device" }, { name: "bittype", description: "Bitstream" }, { name: "alarmSourceType", description: "Source" }, { name: "mediatype", description: "Media" }, { name: "storetype", description: "Store" }, ...timeRange, ...page] },
  { id: "queryPhoto", group: "Video 1078 Business", title: "Picture Query", kind: "action", action: "StandardApiAction_queryPhoto", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", required: true, description: "Device" }, { name: "filetype", description: "File type" }, { name: "alarmType", description: "Alarm" }, ...timeRange, ...page] },
  { id: "queryAudioOrVideo", group: "Video 1078 Business", title: "Audio And Video Query", kind: "action", action: "StandardApiAction_queryAudioOrVideo", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", required: true, description: "Device" }, { name: "type", description: "1 audio 2 video" }, { name: "filetype", description: "File type" }, { name: "alarmType", description: "Alarm" }, ...timeRange, ...page] },

  { id: "mergeRule", group: "Rule related business", title: "New Linkage Alarm", kind: "action", action: "StandardApiAction_mergeRule", method: "GET", requiresSession: true, params: [jsession, { name: "name", required: true, description: "Rule name" }, { name: "type", required: true, description: "Rule type" }, { name: "text", description: "Text" }, { name: "param", description: "Param string" }, { name: "alarmType", description: "Alarm type" }, { name: "begintime", description: "HH:mm:ss" }, { name: "endtime", description: "HH:mm:ss" }] },
  { id: "loadRules", group: "Rule related business", title: "Inquiry Linkage Alarm", kind: "action", action: "StandardApiAction_loadRules", method: "GET", requiresSession: true, params: [jsession, { name: "ruleType", description: "Type" }, { name: "name", description: "Name" }, { name: "alarmType", description: "Alarm" }, ...page] },
  { id: "editRule", group: "Rule related business", title: "Edit Linkage Alarm", kind: "action", action: "StandardApiAction_editRule", method: "GET", requiresSession: true, params: [jsession, { name: "id", required: true, description: "Rule id" }, { name: "name", description: "Name" }, { name: "text", description: "Text" }, { name: "param", description: "Param" }, { name: "begintime", description: "HH:mm:ss" }, { name: "endtime", description: "HH:mm:ss" }] },
  { id: "delRule", group: "Rule related business", title: "Delete Linkage Alarm", kind: "action", action: "StandardApiAction_delRule", method: "GET", requiresSession: true, params: [jsession, { name: "id", required: true, description: "Rule id" }] },
  { id: "devRulePermit", group: "Rule related business", title: "Device Rule Equipment Association", kind: "action", action: "StandardApiAction_devRulePermit", method: "GET", requiresSession: true, params: [jsession, { name: "ruleId", required: true, description: "Rule id" }, { name: "devIdno", required: true, description: "Devices comma separated" }] },
  { id: "loadDevRuleByRuleId", group: "Rule related business", title: "Query Rule Device Association", kind: "action", action: "StandardApiAction_loadDevRuleByRuleId", method: "GET", requiresSession: true, params: [jsession, { name: "ruleId", required: true, description: "Rule id" }] },
  { id: "delDevRule", group: "Rule related business", title: "Delete Regular Device Association", kind: "action", action: "StandardApiAction_delDevRule", method: "GET", requiresSession: true, params: [jsession, { name: "ruleId", required: true, description: "Rule id" }, { name: "devIdno", description: "Device" }] },
  { id: "queryRuleList", group: "Rule related business", title: "Query Rules Based On Rule Type", kind: "action", action: "StandardApiAction_queryRuleList", method: "GET", requiresSession: true, params: [jsession, { name: "type", required: true, description: "Rule type" }] },

  { id: "vehicleControlGPSReport", group: "Control Business", title: "Vehicle Control", kind: "action", action: "StandardApiAction_vehicleControlGPSReport", method: "GET", requiresSession: true, params: [jsession, { name: "DevIDNO", required: true, description: "Device" }, { name: "Time", required: true, description: "GPS report interval in seconds (0-3600)" }] },
  { id: "vehicleControlOthers", group: "Control Business", title: "Vehicle Control (others)", kind: "action", action: "StandardApiAction_vehicleControlOthers", method: "GET", requiresSession: true, params: [jsession, { name: "DevIDNO", required: true, description: "Device" }, { name: "CtrlType", required: true, description: "Control type (5 restart, 6 factory reset, 7 sleep, 8 wake...)" }, { name: "Usr", required: true, description: "Login account" }, { name: "Pwd", required: true, description: "MD5 of the login password" }] },
  { id: "vehicleTTS", group: "Control Business", title: "TTS", kind: "action", action: "StandardApiAction_vehicleTTS", method: "GET", requiresSession: true, params: [jsession, { name: "DevIDNO", required: true, description: "Device" }, { name: "Text", required: true, description: "TTS text" }, { name: "Flag", description: "Default 4 terminal display; 8 TTS read; 1 emergency; 16 ad screen" }] },
  { id: "sendPTZControl", group: "Control Business", title: "PTZ control", kind: "action", action: "StandardApiAction_sendPTZControl", method: "GET", requiresSession: true, params: [
    jsession, { name: "DevIDNO", required: true, description: "Device" }, { name: "Chn", required: true, description: "Channel from 0" },
    { name: "Command", required: true, description: "0 stop 1 up 2 down 3 left 4 right 5 zoom in 6 zoom out 7 aperture + 8 aperture - 9 focus + 10 focus -" },
    { name: "Speed", description: "PTZ speed" }
  ]},

  { id: "getLoadDeviceInfo", group: "Device Management", title: "Get Device Info", kind: "action", action: "StandardApiAction_getLoadDeviceInfo", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", description: "Device" }] },
  { id: "addDevice", group: "Device Management", title: "Add Device", kind: "action", action: "StandardApiAction_addDevice", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", required: true, description: "Device number" }, { name: "devType", description: "Type" }, { name: "companyId", description: "Company" }, { name: "sim", description: "SIM" }, { name: "channel", description: "Channels" }] },
  { id: "editDevice", group: "Device Management", title: "Modification of Equipment", kind: "action", action: "StandardApiAction_editDevice", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", required: true, description: "Device" }, { name: "devType", description: "Type" }, { name: "sim", description: "SIM" }, { name: "channel", description: "Channels" }] },
  { id: "addVehicle", group: "Device Management", title: "Add Vehicle", kind: "action", action: "StandardApiAction_addVehicle", method: "GET", requiresSession: true, params: [jsession, vehiIdno, { name: "companyId", description: "Company" }, { name: "devIdno", description: "Device to bind" }] },
  { id: "deleteDevice", group: "Device Management", title: "Delete Device", kind: "action", action: "StandardApiAction_deleteDevice", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", required: true, description: "Device" }] },
  { id: "deleteVehicle", group: "Device Management", title: "Delete Vehicle", kind: "action", action: "StandardApiAction_deleteVehicle", method: "GET", requiresSession: true, params: [jsession, vehiIdno] },
  { id: "installVehicle", group: "Device Management", title: "Installation equipment", kind: "action", action: "StandardApiAction_installVehicle", method: "GET", requiresSession: true, params: [jsession, vehiIdno, { name: "devIdno", required: true, description: "Device" }] },
  { id: "uninstallDevice", group: "Device Management", title: "Uninstall device", kind: "action", action: "StandardApiAction_uninstallDevice", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", required: true, description: "Device" }] },

  { id: "getFlowInfo", group: "Traffic Card Management", title: "Get Flow Information", kind: "action", action: "StandardApiAction_getFlowInfo", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", description: "Device" }] },
  { id: "saveFlowConfig", group: "Traffic Card Management", title: "Save Flow Configuration", kind: "action", action: "StandardApiAction_saveFlowConfig", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", required: true, description: "Device" }, { name: "flow", description: "Flow config" }] },

  { id: "getUserMarkers", group: "Area Information", title: "User Area Information", kind: "action", action: "StandardApiAction_getUserMarkers", method: "GET", requiresSession: true, params: [jsession] },
  { id: "addMark", group: "Area Information", title: "Add Area", kind: "action", action: "MapMarkerAction_addMark", method: "POST", requiresSession: true, params: [
    jsession, { name: "name", required: true, description: "Marker name" }, { name: "mapType", description: "0 Google 3 Baidu 4 Gaode" },
    { name: "markerType", required: true, description: "1 point 2 rectangle 3 polygon 4 route 10 circle" },
    { name: "radius", description: "Radius metres for circle" }, { name: "share", description: "0 none 1 packet 2 all" },
    { name: "type", description: "Geographic type 2-12" }, { name: "jingDu", required: true, description: "Lng comma separated" },
    { name: "weiDu", required: true, description: "Lat comma separated" }, { name: "color", description: "Hex colour" }, { name: "remark", description: "Remark" }
  ]},
  { id: "editMark", group: "Area Information", title: "Modify Area", kind: "action", action: "MapMarkerAction_editMark", method: "POST", requiresSession: true, params: [
    jsession, { name: "id", required: true, description: "Area id" }, { name: "name", description: "Name" },
    { name: "markerType", description: "Type" }, { name: "jingDu", description: "Lng" }, { name: "weiDu", description: "Lat" }, { name: "radius", description: "Radius" }
  ]},
  { id: "findMark", group: "Area Information", title: "View Area", kind: "action", action: "MapMarkerAction_findMark", method: "GET", requiresSession: true, params: [jsession, { name: "id", required: true, description: "Area id" }] },
  { id: "deleteMark", group: "Area Information", title: "Delete Area", kind: "action", action: "MapMarkerAction_deleteMark", method: "GET", requiresSession: true, params: [jsession, { name: "id", required: true, description: "Area id" }] },

  { id: "mergeCompany", group: "Organization Management", title: "New Organization", kind: "action", action: "StandardApiAction_mergeCompany", method: "GET", requiresSession: true, params: [jsession, { name: "name", required: true, description: "Company name" }, { name: "parentId", description: "Parent" }] },
  { id: "findCompany", group: "Organization Management", title: "Find Organization", kind: "action", action: "StandardApiAction_findCompany", method: "GET", requiresSession: true, params: [jsession, { name: "name", description: "Name" }, { name: "id", description: "Id" }] },
  { id: "deleteCompany", group: "Organization Management", title: "Delete Organization", kind: "action", action: "StandardApiAction_deleteCompany", method: "GET", requiresSession: true, params: [jsession, { name: "id", required: true, description: "Company id" }] },

  { id: "mergeUserRole", group: "Role Management", title: "New Role", kind: "action", action: "StandardApiAction_mergeUserRole", method: "GET", requiresSession: true, params: [jsession, { name: "name", required: true, description: "Role name" }, { name: "privilege", description: "Privilege bits" }] },
  { id: "findUserRole", group: "Role Management", title: "Find Role", kind: "action", action: "StandardApiAction_findUserRole", method: "GET", requiresSession: true, params: [jsession, { name: "name", description: "Name" }, { name: "id", description: "Id" }] },
  { id: "deleteUserRole", group: "Role Management", title: "Delete Role", kind: "action", action: "StandardApiAction_deleteUserRole", method: "GET", requiresSession: true, params: [jsession, { name: "id", required: true, description: "Role id" }] },

  { id: "mergeUserAccount", group: "User Management", title: "New User", kind: "action", action: "StandardApiAction_mergeUserAccount", method: "GET", requiresSession: true, params: [jsession, { name: "account", required: true, description: "Account" }, { name: "password", description: "Password" }, { name: "roleId", description: "Role" }, { name: "companyId", description: "Company" }] },
  { id: "findUserAccount", group: "User Management", title: "Find User", kind: "action", action: "StandardApiAction_findUserAccount", method: "GET", requiresSession: true, params: [jsession, { name: "account", description: "Account" }, { name: "id", description: "Id" }] },
  { id: "deleteUserAccount", group: "User Management", title: "Delete User", kind: "action", action: "StandardApiAction_deleteUserAccount", method: "GET", requiresSession: true, params: [jsession, { name: "id", required: true, description: "User id" }] },
  { id: "getUserDevPermit", group: "User Management", title: "Obtain user device authorization", kind: "action", action: "StandardApiAction_getUserDevPermit", method: "GET", requiresSession: true, params: [jsession, { name: "userId", required: true, description: "User id" }] },
  { id: "addUserDevPermit", group: "User Management", title: "Increase user device authorization", kind: "action", action: "StandardApiAction_addUserDevPermit", method: "GET", requiresSession: true, params: [jsession, { name: "userId", required: true, description: "User id" }, { name: "devIdno", required: true, description: "Devices" }] },
  { id: "delUserDevPermit", group: "User Management", title: "Delete user device authorization", kind: "action", action: "StandardApiAction_delUserDevPermit", method: "GET", requiresSession: true, params: [jsession, { name: "userId", required: true, description: "User id" }, { name: "devIdno", required: true, description: "Devices" }] },

  { id: "findDriverInfoByDeviceId", group: "Driver Management", title: "Inquire whether the driver of the vehicle has changed", kind: "action", action: "StandardApiAction_findDriverInfoByDeviceId", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", required: true, description: "Device" }] },
  { id: "findVehicleInfoByDeviceId", group: "Driver Management", title: "Query the driver of the vehicle according to the equipment number", kind: "action", action: "StandardApiAction_findVehicleInfoByDeviceId", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", required: true, description: "Device" }] },
  { id: "findVehicleInfoByDeviceJn", group: "Driver Management", title: "Query driver information based on qualification certificate", kind: "action", action: "StandardApiAction_findVehicleInfoByDeviceJn", method: "GET", requiresSession: true, params: [jsession, { name: "jn", required: true, description: "Certificate / licence" }] },
  { id: "queryPunchCardRecode", group: "Driver Management", title: "Query Details Of Driver's Punch Card Record", kind: "action", action: "StandardApiAction_queryPunchCardRecode", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", description: "Device" }, ...timeRange, ...page] },
  { id: "queryIdentifyAlarm", group: "Driver Management", title: "Query Identify Alarm", kind: "action", action: "StandardApiAction_queryIdentifyAlarm", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", description: "Device" }, ...timeRange, ...page] },
  { id: "queryDriverList", group: "Driver Management", title: "Query Driver List", kind: "action", action: "StandardApiAction_queryDriverList", method: "GET", requiresSession: true, params: [jsession, { name: "name", description: "Name" }, ...page] },
  { id: "mergeDriver", group: "Driver Management", title: "Add / modify driver", kind: "action", action: "StandardApiAction_mergeDriver", method: "POST", requiresSession: true, params: [jsession, { name: "name", required: true, description: "Driver name" }, { name: "jn", description: "Certificate" }, { name: "license", description: "Licence" }, { name: "phone", description: "Phone" }] },
  { id: "findDriver", group: "Driver Management", title: "Find Driver", kind: "action", action: "StandardApiAction_findDriver", method: "GET", requiresSession: true, params: [jsession, { name: "id", description: "Id" }, { name: "name", description: "Name" }] },
  { id: "deleteDriver", group: "Driver Management", title: "Delete driver", kind: "action", action: "StandardApiAction_deleteDriver", method: "GET", requiresSession: true, params: [jsession, { name: "id", required: true, description: "Driver id" }] },
  { id: "uploadDriverImage", group: "Driver Management", title: "Upload image", kind: "action", action: "StandardApiAction_uploadImage", method: "POST", requiresSession: true, params: [jsession, { name: "id", required: true, description: "Driver id" }, { name: "image", required: true, description: "Image payload" }] },

  { id: "mergeSIMInfo", group: "SIM Management", title: "Add SIM", kind: "action", action: "StandardApiAction_mergeSIMInfo", method: "GET", requiresSession: true, params: [jsession, { name: "sim", required: true, description: "SIM number" }, { name: "companyId", description: "Company" }] },
  { id: "findSIMInfo", group: "SIM Management", title: "Find SIM", kind: "action", action: "StandardApiAction_findSIMInfo", method: "GET", requiresSession: true, params: [jsession, { name: "sim", description: "SIM" }, { name: "id", description: "Id" }] },
  { id: "deleteSIMInfo", group: "SIM Management", title: "Delete SIM", kind: "action", action: "StandardApiAction_deleteSIMInfo", method: "GET", requiresSession: true, params: [jsession, { name: "id", required: true, description: "SIM id" }] },
  { id: "loadSIMInfos", group: "SIM Management", title: "Query SIM (paged)", kind: "action", action: "StandardApiAction_loadSIMInfos", method: "GET", requiresSession: true, params: [jsession, ...page, { name: "sim", description: "SIM filter" }] },
  { id: "unbindingSIM", group: "SIM Management", title: "Unbind sim", kind: "action", action: "StandardApiAction_unbindingSIM", method: "GET", requiresSession: true, params: [jsession, { name: "id", required: true, description: "SIM id" }] },

  { id: "peopleSummary", group: "Reports", title: "Passenger Summary", kind: "action", action: "StandardApiAction_queryPeopleSummary", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", description: "Device" }, ...timeRange, ...page] },
  { id: "peopleDetail", group: "Reports", title: "Passenger Detail", kind: "action", action: "StandardApiAction_queryPeopleDetail", method: "GET", requiresSession: true, params: [jsession, { name: "devIdno", description: "Device" }, ...timeRange, ...page] }
];

export const CMSV6_ERROR_CODES: Record<number, string> = {
  0: "Success",
  1: "Not logged in or session expired",
  2: "No permission",
  3: "Already exists",
  4: "Does not exist",
  5: "Network / device offline",
  6: "Parameter error",
  7: "Account or password error",
  8: "Device not registered",
  21: "Device offline",
  22: "Device busy"
};

export function findCmsv6Endpoint(idOrAction: string): Cmsv6Endpoint | undefined {
  const needle = String(idOrAction ?? "").trim().replace(/\.action$/i, "");
  return CMSV6_ENDPOINTS.find((row) => row.id === needle || row.action === needle || row.action.endsWith(needle));
}

export function listCmsv6Groups(): string[] {
  return [...new Set(CMSV6_ENDPOINTS.map((row) => row.group))];
}
