/**
 * Translations shared by every Meet client.
 *
 * The dictionary lives in the protocol package for the same reason
 * `colorForPeer` and `formatDuration` do: the web client and the React Native
 * client render the same product, and a string that only exists in one of them
 * is a string that will drift. `en` is the source of truth — its keys define
 * `MessageKey`, so a locale that forgets an entry fails to compile.
 */

export const LOCALES = ['en', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];

/** How each language names *itself* — never translated. */
export const LOCALE_LABELS: Record<Locale, string> = { en: 'English', zh: '中文' };

/** Two-glyph form for the compact toggle on narrow screens. */
export const LOCALE_SHORT_LABELS: Record<Locale, string> = { en: 'EN', zh: '中' };

/** BCP 47 tags for `lang` attributes and `Intl` formatting. */
export const LOCALE_TAGS: Record<Locale, string> = { en: 'en', zh: 'zh-CN' };

export const DEFAULT_LOCALE: Locale = 'en';

/* ------------------------------------------------------------------ english */

const en = {
  /* -------------------------------------------------------------- branding */
  'app.name': 'Hide Me',
  'app.description': 'Hide Me — private video meetings. No account, no tracking, nothing stored.',

  /* --------------------------------------------------------------- privacy
   * Every line below is a property of the running system that can be checked,
   * not a marketing claim. `privacy.limit` states what this is NOT, because a
   * privacy page that omits the limitation is the least trustworthy kind. */
  'privacy.heading': 'What this does and does not do',
  'privacy.noAccounts.title': 'No accounts',
  'privacy.noAccounts.body': 'No email, no phone number, no sign-up. Type a name and join.',
  'privacy.noTracking.title': 'No tracking',
  'privacy.noTracking.body': 'No analytics, no cookies, no third-party scripts. The page loads nothing from anyone else.',
  'privacy.nothingStored.title': 'Nothing is stored',
  'privacy.nothingStored.body': 'There is no database. Meetings and chat live in memory and are gone shortly after the last person leaves.',
  'privacy.noRecording.title': 'Recording is off',
  'privacy.noRecording.body': 'Recording is disabled on this server. If a host ever turns it on, everyone sees a badge for as long as it runs.',
  'privacy.encrypted.title': 'Encrypted in transit',
  'privacy.encrypted.body': 'Audio and video travel over DTLS-SRTP; the page and signalling use TLS. Nothing crosses the network in the clear.',
  'privacy.selfHosted.title': 'Self-hosted and open',
  'privacy.selfHosted.body': 'This runs on a server you control, and the source is public. You can read exactly what it does.',
  'privacy.limit.title': 'Not end-to-end encrypted',
  'privacy.limit.body':
    'To send your video to several people at once, the server decrypts it and re-encrypts it for each participant. It is never written to disk, but while a call is running it exists in the server\u2019s memory. Whoever controls that server — and the cloud provider hosting it — could in principle reach it. This is the same trade-off Zoom, Meet and Teams make by default. If you need a guarantee nobody in the middle can ever access, no service of this design can give you one.',
  'privacy.link': 'Privacy',

  /* ---------------------------------------------------------------- shared */
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.dismiss': 'Dismiss',
  'common.copy': 'Copy',
  'common.copied': 'Copied',
  'common.or': 'or',
  'common.systemDefault': 'System default',
  'common.somethingWentWrong': 'Something went wrong.',
  'common.actionFailed': 'Action failed',

  /* -------------------------------------------------------------- language */
  'language.label': 'Language',
  'language.switchTo': 'Switch to {language}',
  'language.current': 'Language: {language}',

  /* ------------------------------------------------------------------ home */
  'home.title': 'Start or join a meeting',
  'home.subtitle': 'Video, audio and screen sharing in your browser. No download, no account, nothing kept.',
  'home.newMeeting': 'New meeting',
  'home.meetingOptions': 'Meeting options',
  'home.hideOptions': 'Hide options',
  'home.meetingName': 'Meeting name',
  'home.meetingNamePlaceholder': 'Weekly standup',
  'home.passcode': 'Passcode (optional)',
  'home.passcodePlaceholder': 'At least 4 characters',
  'home.waitingRoom': 'Waiting room',
  'home.joinWithCode': 'Join with a code',
  'home.joinCodePlaceholder': 'abc-defg-hij',
  'home.join': 'Join',
  'home.createFailedRetry': 'Could not create the meeting. Please try again.',
  'home.createFailed': 'Could not create the meeting.',
  'home.enterCode': 'Enter a meeting code or link.',
  'home.hint':
    'Works in Chrome, Edge, Firefox and Safari, and in the Hide Me apps for macOS and Android. Screen sharing needs a desktop browser or one of the apps.',

  /* --------------------------------------------------------------- prejoin */
  'prejoin.title': 'Ready to join?',
  'prejoin.meeting': 'Meeting {id}',
  'prejoin.cameraOff': 'Camera is off',
  'prejoin.cameraUnavailable': 'Camera unavailable',
  'prejoin.turnOffMic': 'Turn off microphone',
  'prejoin.turnOnMic': 'Turn on microphone',
  'prejoin.turnOffCamera': 'Turn off camera',
  'prejoin.turnOnCamera': 'Turn on camera',
  'prejoin.yourName': 'Your name',
  'prejoin.namePlaceholder': 'Alex Rivera',
  'prejoin.passcode': 'Meeting passcode',
  'prejoin.microphone': 'Microphone',
  'prejoin.camera': 'Camera',
  'prejoin.joinNow': 'Join now',
  'prejoin.enterName': 'Please enter your name.',
  'prejoin.joinFailed': 'Could not join this meeting.',
  'prejoin.deviceFailed': 'Could not access your devices.',

  /* ------------------------------------------------------------------ room */
  'room.meeting': 'Meeting {id}',
  'room.locked': 'Locked',
  'room.lockedTitle': 'Meeting is locked',
  'room.recording': 'Recording',
  'room.reconnecting': 'Reconnecting…',
  'room.copyLink': 'Copy link',
  'room.copyLinkTitle': 'Copy the meeting link',
  'room.waitingTitle': 'Waiting to be admitted',
  'room.waitingText': "The host has been notified. You'll join automatically once they let you in.",
  'room.leftTitle': "You've left the meeting",
  'room.leftSubtitle': 'Thanks for joining.',
  'room.rejoin': 'Rejoin {id}',
  'room.backHome': 'Back to home',
  'room.joinFailed': 'Could not join the meeting.',
  'room.sharingLocal': 'You are sharing your screen',
  'room.sharingRemote': '{name} is sharing their screen',

  /* -------------------------------------------------------------- controls */
  'controls.mute': 'Mute',
  'controls.unmute': 'Unmute',
  'controls.muteHint': 'Mute ({shortcut})',
  'controls.unmuteHint': 'Unmute ({shortcut})',
  'controls.startVideo': 'Start video',
  'controls.stopVideo': 'Stop video',
  'controls.startVideoHint': 'Start video ({shortcut})',
  'controls.stopVideoHint': 'Stop video ({shortcut})',
  'controls.share': 'Share',
  'controls.stopShare': 'Stop share',
  'controls.shareHint': 'Share screen ({shortcut})',
  'controls.stopShareHint': 'Stop sharing ({shortcut})',
  'controls.someoneElseSharing': 'Someone else is sharing',
  'controls.participants': 'Participants',
  'controls.chat': 'Chat',
  'controls.react': 'React',
  'controls.reactions': 'Reactions',
  'controls.sendReaction': 'Send {emoji}',
  'controls.raise': 'Raise',
  'controls.lower': 'Lower',
  'controls.raiseHand': 'Raise hand',
  'controls.lowerHand': 'Lower hand',
  'controls.more': 'More',
  'controls.moreOptions': 'More options',
  'controls.leave': 'Leave',
  'controls.leaveMeeting': 'Leave meeting',
  'controls.speakerView': 'Speaker view',
  'controls.galleryView': 'Gallery view',
  'controls.avSettings': 'Audio & video settings',
  'controls.recordMeeting': 'Record meeting',
  'controls.stopRecording': 'Stop recording',
  'controls.muteEveryone': 'Mute everyone',
  'controls.lockMeeting': 'Lock meeting',
  'controls.unlockMeeting': 'Unlock meeting',
  'controls.endForAll': 'End meeting for all',
  'controls.endConfirm': 'End the meeting for everyone?',

  /* ------------------------------------------------------------------ tile */
  'tile.self': '{name} (you)',
  'tile.screenSuffix': ' — screen',
  'tile.connection': 'Connection: {quality}',
  'tile.pin': 'Pin to main view',
  'tile.unpin': 'Unpin',
  'tile.pinned': 'Pinned',
  'tile.handRaised': 'Hand raised',

  /* ---------------------------------------------------------- participants */
  'participants.title': 'Participants ({count})',
  'participants.close': 'Close participants',
  'participants.waitingToJoin': 'Waiting to join ({count})',
  'participants.inMeeting': 'In the meeting',
  'participants.admit': 'Admit',
  'participants.deny': 'Deny',
  'participants.admitted': 'Admitted',
  'participants.denied': 'Denied',
  'participants.self': '{name} (you)',
  'participants.handRaised': 'Hand raised',
  'participants.sharingScreen': 'Sharing screen',
  'participants.optionsFor': 'Options for {name}',
  'participants.mute': 'Mute',
  'participants.stopVideo': 'Stop video',
  'participants.stopShare': 'Stop screen share',
  'participants.makeCoHost': 'Make co-host',
  'participants.removeCoHost': 'Remove co-host',
  'participants.makeHost': 'Make host',
  'participants.makeHostConfirm': 'Make {name} the host? You will become a co-host.',
  'participants.remove': 'Remove from meeting',
  'participants.removeConfirm': 'Remove {name} from the meeting?',
  'participants.muted': 'Muted {name}',
  'participants.stoppedVideo': "Stopped {name}'s video",
  'participants.stoppedShare': "Stopped {name}'s share",
  'participants.nowCoHost': '{name} is now a co-host',
  'participants.nowHost': '{name} is now the host',
  'participants.removed': 'Removed {name}',
  'participants.muteAll': 'Mute all',
  'participants.allowUnmute': 'Allow unmute',
  'participants.everyoneMuted': 'Everyone muted',
  'participants.unmuteAllowed': 'Unmute allowed',

  /* ------------------------------------------------------------------ role */
  'role.host': 'Host',
  'role.coHost': 'Co-host',

  /* ------------------------------------------------------------------ chat */
  'chat.title': 'Chat',
  'chat.close': 'Close chat',
  'chat.empty': 'No messages yet.',
  'chat.emptyHint': 'Messages are visible to everyone in the meeting.',
  'chat.you': 'You',
  'chat.youObject': 'you',
  'chat.privatelyTo': 'privately to {name}',
  'chat.private': 'private',
  'chat.recipient': 'Message recipient',
  'chat.toEveryone': 'To: Everyone',
  'chat.toPerson': 'To: {name} (private)',
  'chat.placeholder': 'Type a message…',
  'chat.send': 'Send message',
  'chat.notSent': 'Message not sent',

  /* -------------------------------------------------------------- settings */
  'settings.title': 'Settings',
  'settings.close': 'Close settings',
  'settings.microphone': 'Microphone',
  'settings.camera': 'Camera',
  'settings.speaker': 'Speaker',
  'settings.videoQuality': 'Video quality',
  'settings.qualityLow': 'Low — 320p (saves data)',
  'settings.qualityMedium': 'Medium — 360p',
  'settings.qualityHigh': 'High — 720p (recommended)',
  'settings.qualityHd1080': 'Full HD — 1080p',
  'settings.qualityHint':
    'Your camera is sent in three resolutions at once. Each viewer automatically receives the one that fits their layout, so raising this only affects people viewing you full-screen.',
  'settings.meetingControls': 'Meeting controls',
  'settings.waitingRoom': 'Waiting room',
  'settings.waitingRoomHint': 'New participants must be admitted by a host.',
  'settings.lockMeeting': 'Lock meeting',
  'settings.lockMeetingHint': 'Nobody new can join.',
  'settings.allowUnmute': 'Participants can unmute',
  'settings.allowScreenShare': 'Participants can share screen',
  'settings.allowChat': 'Participants can chat',
  'settings.connection': 'Connection',
  'settings.yourNetwork': 'Your network',
  'settings.signaling': 'Signaling',
  'settings.receivingStreams': 'Receiving streams',
  'settings.deviceSwitchFailed': 'Could not switch device',

  /* ---------------------------------------------------------------- device */
  'device.camera': 'camera',
  'device.microphone': 'microphone',
  'device.cameraAndMicrophone': 'camera and microphone',
  'device.accessFailed': 'Could not access your {device}.',
  'device.accessFailedDetail': 'Could not access your {device}: {detail}',
  'device.blocked':
    "Access to your {device} was blocked. Allow it in your browser's site settings (the icon in the address bar) and try again.",
  'device.notFound': 'No {device} found. Connect a device and try again.',
  'device.inUse': 'Your {device} is already in use by another app. Close it and try again.',
  'device.overconstrained': 'Your {device} does not support the requested quality. Try a lower video quality in settings.',
  'device.insecure': 'Media access requires a secure (HTTPS) connection.',
  'device.unsupportedBrowser':
    'This browser cannot access your camera or microphone. Try Chrome, Edge, Firefox or Safari over HTTPS.',
  'device.shareUnsupported': 'Screen sharing is not supported in this browser.',
  'device.shareAndroidOnly': 'Screen sharing is only available on Android in this app.',
  'device.permissionBlocked': 'Access to your {device} is blocked. Enable it in Settings → Apps → Meet → Permissions.',
  'device.permissionNeeded': 'Meet needs access to your {device} to join the meeting.',

  /* --------------------------------------------------------------- quality */
  'quality.excellent': 'Excellent',
  'quality.good': 'Good',
  'quality.poor': 'Poor',
  'quality.critical': 'Critical',
  'quality.disconnected': 'Disconnected',

  /* ------------------------------------------------------------ connection */
  'connection.new': 'Not connected',
  'connection.connecting': 'Connecting',
  'connection.connected': 'Connected',
  'connection.reconnecting': 'Reconnecting',
  'connection.closed': 'Closed',
  'connection.failed': 'Failed',

  /* ------------------------------------------------------------- moderator */
  'moderator.muted': '{name} muted you',
  'moderator.stoppedVideo': '{name} stopped your video',
  'moderator.stoppedShare': '{name} stopped your screen share',
  'moderator.unmuteRequest': '{name} asked you to unmute',

  /* ---------------------------------------------------------------- mobile */
  'mobile.homeSubtitle': 'Video, audio and screen sharing. Share your screen straight from your phone.',
  'mobile.serverSettings': 'Server settings',
  'mobile.hideServerSettings': 'Hide server settings',
  'mobile.serverAddress': 'Server address',
  'mobile.serverHint':
    "Use your computer's LAN address when running the server locally. 10.0.2.2 reaches the host machine from the Android emulator.",
  'mobile.serverResponded': 'Server responded {status}',
  'mobile.serverUnreachable': 'Could not reach the server at {url}. {detail}',
  'mobile.cameraFailed': 'Could not open the camera.',
  'mobile.rejoin': 'Rejoin',
  'mobile.people': 'People',
  'mobile.start': 'Start',
  'mobile.stop': 'Stop',
  'mobile.switchCamera': 'Switch camera',
  'mobile.speakerOn': 'Speaker on',
  'mobile.speakerOff': 'Speaker off',
  'mobile.sendAReaction': 'Send a reaction',
  'mobile.hostControls': 'Host controls',
  'mobile.endMeeting': 'End meeting',
  'mobile.endMeetingBody': 'This ends the meeting for everyone.',
  'mobile.end': 'End',
  'mobile.leaveConfirmTitle': 'Leave meeting',
  'mobile.leaveConfirmBody': 'Are you sure you want to leave?',
  'mobile.removeParticipantTitle': 'Remove participant',
  'mobile.remove': 'Remove',
  'mobile.rec': 'REC',
  'mobile.sharingShort': '{name} is sharing',
  'mobile.waitingToJoin': 'Waiting to join',
  'mobile.roleUpdated': 'Role updated',
  'mobile.videoStopped': 'Video stopped',
  'mobile.shareStopped': 'Share stopped',
  'mobile.removed': 'Removed',

  /* ------------------------------------------------------------ minimizing
   * The floating window, the system Picture-in-Picture window and the ongoing
   * notification are three views of one idea: the meeting keeps running while
   * you are somewhere else. Nothing here is written down anywhere — the window
   * is a live view of the same connection, and it disappears with it. */
  'mini.minimize': 'Minimize',
  'mini.returnToMeeting': 'Return to meeting',
  'mini.inAMeeting': 'You are in a meeting',
  'mini.tapToReturn': 'Tap the window to come back',
  'mini.hint': 'The meeting keeps running. Tap the small window to come back.',
  'mini.window': 'Meeting, minimized',
  'mini.expand': 'Expand',
  'mini.pipUnavailable': 'This phone does not support a floating window over other apps.',
  'mini.notificationTitle': 'Meeting in progress',
  'mini.notificationBody': 'Tap to return to the meeting.',
  'mini.notificationChannel': 'Ongoing meeting',
  'mini.notificationChannelBody': 'Shows that a meeting is still running while you are in another app.',
} as const;

export type MessageKey = keyof typeof en;

/* ------------------------------------------------------------------ chinese */

const zh: Record<MessageKey, string> = {
  /* -------------------------------------------------------------- branding */
  'app.name': 'Hide Me',
  'app.description': 'Hide Me —— 私密视频会议。无需账号，不做追踪，不留记录。',

  'privacy.heading': '本服务能做什么，不能做什么',
  'privacy.noAccounts.title': '无需账号',
  'privacy.noAccounts.body': '无需邮箱、手机号或注册。输入名字即可加入。',
  'privacy.noTracking.title': '不做追踪',
  'privacy.noTracking.body': '没有统计分析、没有 Cookie、没有第三方脚本。页面不会向任何第三方发起请求。',
  'privacy.nothingStored.title': '不留记录',
  'privacy.nothingStored.body': '没有数据库。会议和聊天仅存在于内存中，最后一人离开后随即清除。',
  'privacy.noRecording.title': '未开启录制',
  'privacy.noRecording.body': '本服务器已关闭录制功能。若主持人开启录制，录制期间所有人都会看到提示标识。',
  'privacy.encrypted.title': '传输加密',
  'privacy.encrypted.body': '音视频通过 DTLS-SRTP 传输，页面与信令使用 TLS。数据不会以明文形式经过网络。',
  'privacy.selfHosted.title': '自建且开源',
  'privacy.selfHosted.body': '本服务运行在你自己掌控的服务器上，源代码公开，可自行查阅其具体行为。',
  'privacy.limit.title': '并非端到端加密',
  'privacy.limit.body':
    '为了将你的视频同时转发给多人，服务器需要先解密再为每位参与者重新加密。这些数据不会写入磁盘，但在通话进行期间会存在于服务器内存中。掌控该服务器的人——以及托管它的云服务商——原则上可以接触到这些数据。Zoom、Meet 和 Teams 默认也是同样的取舍。如果你需要"任何中间方都无法接触"的保证，这类架构的服务都无法提供。',
  'privacy.link': '隐私说明',

  /* ---------------------------------------------------------------- shared */
  'common.cancel': '取消',
  'common.close': '关闭',
  'common.dismiss': '关闭提示',
  'common.copy': '复制',
  'common.copied': '已复制',
  'common.or': '或',
  'common.systemDefault': '系统默认',
  'common.somethingWentWrong': '出了点问题。',
  'common.actionFailed': '操作失败',

  /* -------------------------------------------------------------- language */
  'language.label': '语言',
  'language.switchTo': '切换为{language}',
  'language.current': '语言：{language}',

  /* ------------------------------------------------------------------ home */
  'home.title': '发起或加入会议',
  'home.subtitle': '在浏览器中进行视频、音频和屏幕共享。无需下载，无需注册，不留记录。',
  'home.newMeeting': '发起新会议',
  'home.meetingOptions': '会议选项',
  'home.hideOptions': '隐藏选项',
  'home.meetingName': '会议名称',
  'home.meetingNamePlaceholder': '每周例会',
  'home.passcode': '入会密码（可选）',
  'home.passcodePlaceholder': '至少 4 个字符',
  'home.waitingRoom': '等候室',
  'home.joinWithCode': '使用会议号加入',
  'home.joinCodePlaceholder': 'abc-defg-hij',
  'home.join': '加入',
  'home.createFailedRetry': '无法创建会议，请重试。',
  'home.createFailed': '无法创建会议。',
  'home.enterCode': '请输入会议号或会议链接。',
  'home.hint': '支持 Chrome、Edge、Firefox 和 Safari 浏览器，以及 Hide Me 的 macOS 与安卓应用。屏幕共享需要在桌面浏览器或客户端应用中使用。',

  /* --------------------------------------------------------------- prejoin */
  'prejoin.title': '准备好加入了吗？',
  'prejoin.meeting': '会议 {id}',
  'prejoin.cameraOff': '摄像头已关闭',
  'prejoin.cameraUnavailable': '摄像头不可用',
  'prejoin.turnOffMic': '关闭麦克风',
  'prejoin.turnOnMic': '打开麦克风',
  'prejoin.turnOffCamera': '关闭摄像头',
  'prejoin.turnOnCamera': '打开摄像头',
  'prejoin.yourName': '你的名字',
  'prejoin.namePlaceholder': '张伟',
  'prejoin.passcode': '入会密码',
  'prejoin.microphone': '麦克风',
  'prejoin.camera': '摄像头',
  'prejoin.joinNow': '立即加入',
  'prejoin.enterName': '请输入你的名字。',
  'prejoin.joinFailed': '无法加入此会议。',
  'prejoin.deviceFailed': '无法访问你的设备。',

  /* ------------------------------------------------------------------ room */
  'room.meeting': '会议 {id}',
  'room.locked': '已锁定',
  'room.lockedTitle': '会议已锁定',
  'room.recording': '录制中',
  'room.reconnecting': '正在重新连接…',
  'room.copyLink': '复制链接',
  'room.copyLinkTitle': '复制会议链接',
  'room.waitingTitle': '等待主持人允许你加入',
  'room.waitingText': '已通知主持人。主持人允许后你将自动加入会议。',
  'room.leftTitle': '你已离开会议',
  'room.leftSubtitle': '感谢参与本次会议。',
  'room.rejoin': '重新加入 {id}',
  'room.backHome': '返回首页',
  'room.joinFailed': '无法加入会议。',
  'room.sharingLocal': '你正在共享屏幕',
  'room.sharingRemote': '{name} 正在共享屏幕',

  /* -------------------------------------------------------------- controls */
  'controls.mute': '静音',
  'controls.unmute': '解除静音',
  'controls.muteHint': '静音（{shortcut}）',
  'controls.unmuteHint': '解除静音（{shortcut}）',
  'controls.startVideo': '开启视频',
  'controls.stopVideo': '停止视频',
  'controls.startVideoHint': '开启视频（{shortcut}）',
  'controls.stopVideoHint': '停止视频（{shortcut}）',
  'controls.share': '共享屏幕',
  'controls.stopShare': '停止共享',
  'controls.shareHint': '共享屏幕（{shortcut}）',
  'controls.stopShareHint': '停止共享（{shortcut}）',
  'controls.someoneElseSharing': '其他人正在共享屏幕',
  'controls.participants': '参会者',
  'controls.chat': '聊天',
  'controls.react': '表情',
  'controls.reactions': '表情回应',
  'controls.sendReaction': '发送 {emoji}',
  'controls.raise': '举手',
  'controls.lower': '放下手',
  'controls.raiseHand': '举手',
  'controls.lowerHand': '放下手',
  'controls.more': '更多',
  'controls.moreOptions': '更多选项',
  'controls.leave': '离开',
  'controls.leaveMeeting': '离开会议',
  'controls.speakerView': '演讲者视图',
  'controls.galleryView': '平铺视图',
  'controls.avSettings': '音频与视频设置',
  'controls.recordMeeting': '录制会议',
  'controls.stopRecording': '停止录制',
  'controls.muteEveryone': '全体静音',
  'controls.lockMeeting': '锁定会议',
  'controls.unlockMeeting': '解锁会议',
  'controls.endForAll': '结束全体会议',
  'controls.endConfirm': '确定要结束所有人的会议吗？',

  /* ------------------------------------------------------------------ tile */
  'tile.self': '{name}（我）',
  'tile.screenSuffix': ' —— 屏幕共享',
  'tile.connection': '连接质量：{quality}',
  'tile.pin': '固定到主画面',
  'tile.unpin': '取消固定',
  'tile.pinned': '已固定',
  'tile.handRaised': '已举手',

  /* ---------------------------------------------------------- participants */
  'participants.title': '参会者（{count}）',
  'participants.close': '关闭参会者面板',
  'participants.waitingToJoin': '等待加入（{count}）',
  'participants.inMeeting': '会议中',
  'participants.admit': '允许加入',
  'participants.deny': '拒绝',
  'participants.admitted': '已允许加入',
  'participants.denied': '已拒绝',
  'participants.self': '{name}（我）',
  'participants.handRaised': '已举手',
  'participants.sharingScreen': '正在共享屏幕',
  'participants.optionsFor': '{name} 的操作选项',
  'participants.mute': '静音',
  'participants.stopVideo': '停止视频',
  'participants.stopShare': '停止屏幕共享',
  'participants.makeCoHost': '设为联席主持人',
  'participants.removeCoHost': '取消联席主持人',
  'participants.makeHost': '设为主持人',
  'participants.makeHostConfirm': '要将 {name} 设为主持人吗？你将变为联席主持人。',
  'participants.remove': '移出会议',
  'participants.removeConfirm': '确定要将 {name} 移出会议吗？',
  'participants.muted': '已将 {name} 静音',
  'participants.stoppedVideo': '已停止 {name} 的视频',
  'participants.stoppedShare': '已停止 {name} 的屏幕共享',
  'participants.nowCoHost': '{name} 已成为联席主持人',
  'participants.nowHost': '{name} 已成为主持人',
  'participants.removed': '已将 {name} 移出会议',
  'participants.muteAll': '全体静音',
  'participants.allowUnmute': '允许解除静音',
  'participants.everyoneMuted': '已将所有人静音',
  'participants.unmuteAllowed': '已允许解除静音',

  /* ------------------------------------------------------------------ role */
  'role.host': '主持人',
  'role.coHost': '联席主持人',

  /* ------------------------------------------------------------------ chat */
  'chat.title': '聊天',
  'chat.close': '关闭聊天',
  'chat.empty': '还没有消息。',
  'chat.emptyHint': '消息对会议中的所有人可见。',
  'chat.you': '我',
  'chat.youObject': '我',
  'chat.privatelyTo': '私聊 {name}',
  'chat.private': '私聊',
  'chat.recipient': '消息接收者',
  'chat.toEveryone': '发送给：所有人',
  'chat.toPerson': '发送给：{name}（私聊）',
  'chat.placeholder': '输入消息…',
  'chat.send': '发送消息',
  'chat.notSent': '消息发送失败',

  /* -------------------------------------------------------------- settings */
  'settings.title': '设置',
  'settings.close': '关闭设置',
  'settings.microphone': '麦克风',
  'settings.camera': '摄像头',
  'settings.speaker': '扬声器',
  'settings.videoQuality': '视频质量',
  'settings.qualityLow': '低 —— 320p（节省流量）',
  'settings.qualityMedium': '中 —— 360p',
  'settings.qualityHigh': '高 —— 720p（推荐）',
  'settings.qualityHd1080': '超清 —— 1080p',
  'settings.qualityHint':
    '你的摄像头画面会同时以三种分辨率发送。每位参会者会自动收到最适合其画面布局的一种，因此调高此设置只会影响全屏观看你的人。',
  'settings.meetingControls': '会议控制',
  'settings.waitingRoom': '等候室',
  'settings.waitingRoomHint': '新参会者需由主持人允许后才能加入。',
  'settings.lockMeeting': '锁定会议',
  'settings.lockMeetingHint': '任何新的参会者都无法加入。',
  'settings.allowUnmute': '允许参会者解除静音',
  'settings.allowScreenShare': '允许参会者共享屏幕',
  'settings.allowChat': '允许参会者聊天',
  'settings.connection': '连接',
  'settings.yourNetwork': '你的网络',
  'settings.signaling': '信令连接',
  'settings.receivingStreams': '接收中的媒体流',
  'settings.deviceSwitchFailed': '无法切换设备',

  /* ---------------------------------------------------------------- device */
  'device.camera': '摄像头',
  'device.microphone': '麦克风',
  'device.cameraAndMicrophone': '摄像头和麦克风',
  'device.accessFailed': '无法访问你的{device}。',
  'device.accessFailedDetail': '无法访问你的{device}：{detail}',
  'device.blocked': '你的{device}访问权限已被阻止。请在浏览器的网站设置（地址栏中的图标）中允许后重试。',
  'device.notFound': '未找到{device}。请连接设备后重试。',
  'device.inUse': '你的{device}正被其他应用占用。请关闭该应用后重试。',
  'device.overconstrained': '你的{device}不支持所请求的画质。请在设置中降低视频质量。',
  'device.insecure': '访问媒体设备需要安全连接（HTTPS）。',
  'device.unsupportedBrowser': '此浏览器无法访问你的摄像头或麦克风。请通过 HTTPS 使用 Chrome、Edge、Firefox 或 Safari。',
  'device.shareUnsupported': '此浏览器不支持屏幕共享。',
  'device.shareAndroidOnly': '本应用仅在 Android 上支持屏幕共享。',
  'device.permissionBlocked': '你的{device}访问权限已被阻止。请在“设置 → 应用 → Meet → 权限”中开启。',
  'device.permissionNeeded': 'Meet 需要访问你的{device}才能加入会议。',

  /* --------------------------------------------------------------- quality */
  'quality.excellent': '极佳',
  'quality.good': '良好',
  'quality.poor': '较差',
  'quality.critical': '很差',
  'quality.disconnected': '已断开',

  /* ------------------------------------------------------------ connection */
  'connection.new': '尚未连接',
  'connection.connecting': '正在连接',
  'connection.connected': '已连接',
  'connection.reconnecting': '正在重新连接',
  'connection.closed': '已关闭',
  'connection.failed': '连接失败',

  /* ------------------------------------------------------------- moderator */
  'moderator.muted': '{name} 将你静音',
  'moderator.stoppedVideo': '{name} 停止了你的视频',
  'moderator.stoppedShare': '{name} 停止了你的屏幕共享',
  'moderator.unmuteRequest': '{name} 请你解除静音',

  /* ---------------------------------------------------------------- mobile */
  'mobile.homeSubtitle': '视频、音频与屏幕共享。可直接从手机共享屏幕。',
  'mobile.serverSettings': '服务器设置',
  'mobile.hideServerSettings': '隐藏服务器设置',
  'mobile.serverAddress': '服务器地址',
  'mobile.serverHint': '在本地运行服务器时请填写电脑的局域网地址。安卓模拟器可通过 10.0.2.2 访问宿主机。',
  'mobile.serverResponded': '服务器返回 {status}',
  'mobile.serverUnreachable': '无法连接到服务器 {url}。{detail}',
  'mobile.cameraFailed': '无法打开摄像头。',
  'mobile.rejoin': '重新加入',
  'mobile.people': '参会者',
  'mobile.start': '开启',
  'mobile.stop': '停止',
  'mobile.switchCamera': '切换摄像头',
  'mobile.speakerOn': '扬声器已开',
  'mobile.speakerOff': '扬声器已关',
  'mobile.sendAReaction': '发送表情',
  'mobile.hostControls': '主持人控制',
  'mobile.endMeeting': '结束会议',
  'mobile.endMeetingBody': '这将结束所有人的会议。',
  'mobile.end': '结束',
  'mobile.leaveConfirmTitle': '离开会议',
  'mobile.leaveConfirmBody': '确定要离开会议吗？',
  'mobile.removeParticipantTitle': '移出参会者',
  'mobile.remove': '移出',
  'mobile.rec': '录制中',
  'mobile.sharingShort': '{name} 正在共享',
  'mobile.waitingToJoin': '等待加入',
  'mobile.roleUpdated': '角色已更新',
  'mobile.videoStopped': '已停止视频',
  'mobile.shareStopped': '已停止共享',
  'mobile.removed': '已移出会议',

  /* ------------------------------------------------------------------ 小窗 */
  'mini.minimize': '最小化',
  'mini.returnToMeeting': '返回会议',
  'mini.inAMeeting': '你正在会议中',
  'mini.tapToReturn': '点击小窗即可返回',
  'mini.hint': '会议仍在继续。点击小窗即可返回。',
  'mini.window': '会议小窗',
  'mini.expand': '展开',
  'mini.pipUnavailable': '此设备不支持在其他应用之上显示小窗。',
  'mini.notificationTitle': '会议进行中',
  'mini.notificationBody': '点击返回会议。',
  'mini.notificationChannel': '进行中的会议',
  'mini.notificationChannelBody': '在你使用其他应用时，提示会议仍在进行。',
};

export const messages: Record<Locale, Record<MessageKey, string>> = { en, zh };

/* ------------------------------------------------------------------- api */

export type MessageParams = Record<string, string | number>;
export type Translator = (key: MessageKey, params?: MessageParams) => string;

/** Fills `{placeholder}` slots. An unknown placeholder is left untouched. */
export function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  // Falling back through English rather than rendering the raw key means a gap
  // shows up as untranslated text, not as `chat.title` in someone's meeting.
  const template = messages[locale]?.[key] ?? messages[DEFAULT_LOCALE][key] ?? key;
  return interpolate(template, params);
}

export function createTranslator(locale: Locale): Translator {
  return (key, params) => translate(locale, key, params);
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Best-effort match of a BCP 47 tag (or a stored preference) onto a locale we
 * ship. `zh-Hant-TW`, `zh-CN` and `zh` all land on Chinese.
 */
export function resolveLocale(candidate: string | null | undefined, fallback: Locale = DEFAULT_LOCALE): Locale {
  if (!candidate) return fallback;
  const tag = candidate.trim().toLowerCase();
  if (isLocale(tag)) return tag;
  const primary = tag.split(/[-_]/)[0];
  if (isLocale(primary)) return primary;
  return fallback;
}

/* --------------------------------------------------- server-produced text */

/**
 * The signaling server and the HTTP API answer in English: they have no idea
 * which language the person on the other end reads, and putting a locale on the
 * wire would mean every error string existed twice. Instead the client maps the
 * text back to a translation on the way to the screen.
 *
 * Keys are the exact English message. `SERVER_MESSAGE_PATTERNS` covers the ones
 * that interpolate a name, so they cannot be matched literally.
 */
const SERVER_MESSAGES: Record<string, Record<Locale, string>> = {
  /* room / lobby */
  'This meeting is full.': { en: 'This meeting is full.', zh: '本次会议人数已满。' },
  'this meeting is full': { en: 'This meeting is full.', zh: '本次会议人数已满。' },
  'This meeting is locked.': { en: 'This meeting is locked.', zh: '本次会议已锁定。' },
  'this meeting is locked': { en: 'This meeting is locked.', zh: '本次会议已锁定。' },
  'Incorrect meeting passcode.': { en: 'Incorrect meeting passcode.', zh: '入会密码不正确。' },
  'invalid meeting id': { en: 'Invalid meeting id.', zh: '会议号无效。' },
  'peer id already in this room': { en: 'You are already in this meeting.', zh: '你已经在这个会议中了。' },
  'already joined': { en: 'You have already joined.', zh: '你已加入会议。' },
  'peer is not in the lobby': { en: 'That person is no longer waiting.', zh: '该参会者已不在等候室中。' },
  'The host did not admit you to this meeting.': {
    en: 'The host did not admit you to this meeting.',
    zh: '主持人未允许你加入本次会议。',
  },
  'The host ended this meeting.': { en: 'The host ended this meeting.', zh: '主持人已结束本次会议。' },
  'failed to open meeting': { en: 'Could not open the meeting.', zh: '无法打开会议。' },

  /* permissions */
  'the host has disabled screen sharing': {
    en: 'The host has disabled screen sharing.',
    zh: '主持人已禁用屏幕共享。',
  },
  'the host has muted everyone': { en: 'The host has muted everyone.', zh: '主持人已将所有人静音。' },
  'the host has disabled chat': { en: 'The host has disabled chat.', zh: '主持人已禁用聊天。' },
  'host privileges required': { en: 'Host privileges are required.', zh: '此操作需要主持人权限。' },
  'only the host can change roles': { en: 'Only the host can change roles.', zh: '只有主持人可以更改角色。' },
  'only the host can end the meeting': {
    en: 'Only the host can end the meeting.',
    zh: '只有主持人可以结束会议。',
  },
  'cannot remove the host': { en: 'The host cannot be removed.', zh: '无法移出主持人。' },

  /* recording */
  'recording is disabled': { en: 'Recording is disabled on this server.', zh: '本服务器已禁用录制功能。' },
  'already recording': { en: 'Already recording.', zh: '已在录制中。' },
  'not recording': { en: 'Not recording.', zh: '当前未在录制。' },

  /* chat */
  'empty message': { en: 'The message is empty.', zh: '消息内容为空。' },
  'recipient not found': { en: 'That person is no longer in the meeting.', zh: '该收件人已不在会议中。' },

  /* lookups */
  'participant not found': { en: 'That participant is no longer here.', zh: '该参会者已不在会议中。' },
  'transport not found': { en: 'The media connection was lost.', zh: '媒体连接已断开。' },
  'producer not found': { en: 'That stream has ended.', zh: '该媒体流已结束。' },
  'consumer not found': { en: 'That stream has ended.', zh: '该媒体流已结束。' },

  'you must join the meeting first': {
    en: 'You must join the meeting first.',
    zh: '请先加入会议。',
  },
  'Screen share cancelled.': { en: 'Screen sharing was cancelled.', zh: '已取消屏幕共享。' },

  /* transport / plumbing */
  'too many requests': { en: 'Too many requests — please slow down.', zh: '请求过于频繁，请稍后再试。' },
  'no request handler registered': { en: 'The server is not ready yet.', zh: '服务器尚未就绪。' },
  'no handler': { en: 'The server is not ready yet.', zh: '服务器尚未就绪。' },
  'handler failed': { en: 'The request failed.', zh: '请求处理失败。' },
  'internal error': { en: 'Something went wrong on the server.', zh: '服务器发生内部错误。' },
  'request failed': { en: 'The request failed.', zh: '请求失败。' },
  'connection closed': { en: 'The connection was closed.', zh: '连接已关闭。' },
  'client closed': { en: 'The connection was closed.', zh: '连接已关闭。' },
  'connection closed before it opened': { en: 'The connection could not be opened.', zh: '连接尚未建立便已关闭。' },
  'failed to open socket': { en: 'Could not reach the server.', zh: '无法连接到服务器。' },
  'not connected': { en: 'Not connected to the meeting.', zh: '尚未连接到会议。' },

  /* media engine — thrown deep inside the shared engine, which has no locale */
  'device not loaded': { en: 'The media engine is not ready yet.', zh: '媒体引擎尚未就绪。' },
  'WebSocket connection failed': { en: 'Could not reach the server.', zh: '无法连接到服务器。' },
  'Your microphone was disconnected.': {
    en: 'Your microphone was disconnected.',
    zh: '你的麦克风已断开连接。',
  },
  'Your camera was disconnected.': { en: 'Your camera was disconnected.', zh: '你的摄像头已断开连接。' },
  'no microphone track': { en: 'No microphone is available.', zh: '没有可用的麦克风。' },
  'no camera track': { en: 'No camera is available.', zh: '没有可用的摄像头。' },
  'no screen video track': { en: 'The screen share produced no video.', zh: '屏幕共享没有产生视频。' },
  'no receive transport': { en: 'The media connection is not ready.', zh: '媒体接收通道尚未就绪。' },
  'Screen sharing is not supported on this device.': {
    en: 'Screen sharing is not supported on this device.',
    zh: '此设备不支持屏幕共享。',
  },
};

/** Messages carrying a name or other runtime value, matched structurally. */
const SERVER_MESSAGE_PATTERNS: Array<{ pattern: RegExp; text: Record<Locale, string> }> = [
  {
    pattern: /^(?<name>.+) is already sharing their screen$/,
    text: {
      en: '{name} is already sharing their screen.',
      zh: '{name} 已在共享屏幕。',
    },
  },
  {
    pattern: /^(?<name>.+) removed you from the meeting\.$/,
    text: { en: '{name} removed you from the meeting.', zh: '{name} 已将你移出会议。' },
  },
  {
    pattern: /^request "(?<method>[^"]+)" timed out$/,
    text: { en: 'The server did not answer in time.', zh: '服务器响应超时。' },
  },
  {
    pattern: /^(?<kind>producer|consumer|transport) not found$/,
    text: { en: 'That stream has ended.', zh: '该媒体流已结束。' },
  },
  {
    pattern: /^connection closed \((?<code>\d+)\)$/,
    text: { en: 'The connection was closed.', zh: '连接已关闭。' },
  },
  {
    // A method one side does not implement — a version skew, not a user error.
    pattern: /^(?:unknown method "[^"]*"|unhandled method .+|unknown server request .+)$/,
    text: {
      en: 'This version of the app does not support that request. Try reloading.',
      zh: '当前版本的应用不支持该请求，请尝试重新加载。',
    },
  },
  {
    pattern: /^invalid payload for "[^"]*":/,
    text: { en: 'The request was malformed.', zh: '请求格式有误。' },
  },
  {
    // Catch-all for the remaining `<thing> not found` lookups. The ones users
    // actually hit are spelled out above; this keeps a novel one from arriving
    // in English.
    pattern: /^[\w .'-]+ not found$/,
    text: { en: 'That is no longer available.', zh: '该内容已不存在。' },
  },
];

/**
 * Translates a message that originated on the server (or from a browser API)
 * into `locale`. Anything unrecognised is returned unchanged — showing the
 * original English beats swallowing an error nobody can then report.
 */
export function translateServerText(locale: Locale, text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;

  const exact = SERVER_MESSAGES[trimmed];
  if (exact) return exact[locale] ?? exact[DEFAULT_LOCALE];

  for (const { pattern, text: template } of SERVER_MESSAGE_PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match) {
      const raw = template[locale] ?? template[DEFAULT_LOCALE];
      return interpolate(raw, match.groups as MessageParams | undefined);
    }
  }

  return text;
}

/** Every literal the server may send, for the coverage test. */
export const SERVER_MESSAGE_KEYS = Object.keys(SERVER_MESSAGES);
export const SERVER_MESSAGE_REGEXPS = SERVER_MESSAGE_PATTERNS.map((entry) => entry.pattern);
