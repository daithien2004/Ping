/** AudioContext dùng chung một instance (giới hạn số context); tab ẩn có thể suspended — thử resume, không thành thì bỏ qua. */
let context: AudioContext | null = null;

export function playNotifyBeep(): void {
  if (typeof window === 'undefined') return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context ??= new Ctor();
    if (context.state === 'suspended') void context.resume();
    const osc = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.connect(gain).connect(context.destination);
    osc.start(now);
    osc.stop(now + 0.22);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  } catch {
    // Autoplay/AudioContext lỗi: bỏ qua, âm thanh chỉ là phụ.
  }
}
