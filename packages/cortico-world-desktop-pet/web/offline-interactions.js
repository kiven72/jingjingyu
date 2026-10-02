/** Local replies and gestures. No model, microphone or network calls. */
export const OFFLINE_TOPICS = ["你好呀", "夸夸我", "开心一点", "一起看视频", "去睡一会"];

export const OFFLINE_EXPRESSIONS = [
  ['neutral', '平常'], ['happy', '开心'], ['wink', '眨眼'], ['love', '喜欢'],
  ['shy', '害羞'], ['surprised', '惊讶'], ['angry', '生气'], ['sad', '难过'], ['sleepy', '犯困'],
];

export const OFFLINE_ACTIONS = [
  ['stand', '站好'], ['jump', '跳跃'], ['hop', '小跳'], ['nod', '点头'],
  ['shake', '摇头'], ['spin', '转圈'], ['sit', '坐下'], ['sleep', '睡觉'],
];

function fallbackReply(text, user = '伙伴') {
  const name = String(user || '伙伴');
  if (/累|疲惫|难过|烦|不开心|压力/.test(text)) {
    return { text: `${name}，辛苦啦。先放松一下肩膀，我陪你慢慢来。`, expression: 'love', action: 'nod' };
  }
  if (/鼓励|加油|努力|紧张|害怕/.test(text)) {
    return { text: `${name}，先做好眼前的一小步就很棒了。给你加油！`, expression: 'happy', action: 'hop' };
  }
  if (/休息|睡|晚安/.test(text)) {
    return { text: '那就一起歇一会儿吧。记得喝水，也让眼睛休息一下。', expression: 'sleepy', action: 'sit' };
  }
  if (/跳|转圈/.test(text)) {
    return { text: '看我的！', expression: 'happy', action: /转圈/.test(text) ? 'spin' : 'jump' };
  }
  if (/喜欢|可爱|谢谢/.test(text)) {
    return { text: '收到啦！能陪着你，我也很开心。', expression: 'shy', action: 'nod' };
  }
  if (/你好|早|招呼|嗨|hello/iu.test(text)) {
    return { text: `${name}，你好呀！今天也一起度过吧。`, expression: 'happy', action: 'nod' };
  }
  return { text: '我在这里陪着你呢。可以和我打招呼、说说心情，或叫我跳一跳。', expression: 'wink', action: 'nod' };
}

const REFERENCE_REPLIES = {
  "你好呀": "你好～今天也一起慢慢过吧！",
  "夸夸我": "能认真把事情做好就很棒啦，也记得休息哦。",
  "开心一点": "嘿嘿，送你一个大大的笑脸！",
  "一起看视频": "好呀，我在旁边安静陪你。",
  "去睡一会": "那我眯一会，醒来继续陪你～"
};

export function offlineReply(text, user) {
  const reply = fallbackReply(text, user);
  return Object.hasOwn(REFERENCE_REPLIES, text) ? { ...reply, text: REFERENCE_REPLIES[text] } : reply;
}
