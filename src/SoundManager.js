// 音を合成する簡易シンセサイザー
const ctx = new (window.AudioContext || window.webkitAudioContext)();

export const playSound = (type) => {
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  const now = ctx.currentTime;

  if (type === 'correct') {
    // 正解音（ピンポン！）
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now); // A5
    osc.frequency.setValueAtTime(1760, now + 0.1); // A6
    gainNode.gain.setValueAtTime(0.3, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);

  } else if (type === 'clear') {
    // クリア音（ファンファーレ風）
    osc.type = 'triangle';
    
    // タ・タ・タ・ターン！
    const melody = [523.25, 659.25, 783.99, 1046.50]; // C E G C
    const timings = [0, 0.1, 0.2, 0.4];
    const lengths = [0.1, 0.1, 0.1, 0.6];

    melody.forEach((freq, i) => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      
      osc2.type = 'triangle';
      osc2.frequency.value = freq;
      
      const time = now + timings[i];
      gain2.gain.setValueAtTime(0.3, time);
      gain2.gain.exponentialRampToValueAtTime(0.01, time + lengths[i]);
      
      osc2.start(time);
      osc2.stop(time + lengths[i] + 0.1);
    });
  }
};