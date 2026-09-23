// Run against an operator-controlled LiveKit project with LIVEKIT_URL,
// LIVEKIT_API_KEY and LIVEKIT_API_SECRET set in the process environment.
// Two isolated Chrome contexts exchange synthetic camera and microphone media.
import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const { LIVEKIT_URL: socketUrl, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = process.env;
if (!socketUrl || !key || !secret || !/^wss:\/\/[^/?#]+$/.test(socketUrl)) {
  throw new Error('Set a valid LiveKit URL, API key and API secret.');
}

const apiUrl = socketUrl.replace(/^wss:/, 'https:');
const roomName = `mdp-smoke-${randomUUID().replaceAll('-', '')}`;
const now = Math.floor(Date.now() / 1000);
const encode = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
function token(identity, grant) {
  const data = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: key, sub: identity, iat: now, nbf: now - 5, exp: now + 300, video: grant })}`;
  return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
}
async function roomRequest(method, body, grant) {
  const response = await fetch(`${apiUrl}/twirp/livekit.RoomService/${method}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token('media-smoke-service', grant)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${method} returned HTTP ${response.status}`);
  return response.json();
}

const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/sdk.js') {
    response.setHeader('Content-Type', 'application/javascript');
    import('node:fs').then(({ createReadStream }) => createReadStream(new URL('../node_modules/livekit-client/dist/livekit-client.umd.js', import.meta.url)).pipe(response));
  } else {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html><head><meta charset="utf-8"></head><body><script src="/sdk.js"></script></body></html>');
  }
});
let browser;
let created = false;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await roomRequest('CreateRoom', { name: roomName, max_participants: 2, empty_timeout: 60, departure_timeout: 30 }, { roomCreate: true });
  created = true;
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined),
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
  });
  const pages = [];
  for (const identity of ['smoke-dentist', 'smoke-patient']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async ({ url, accessToken }) => {
      const room = new window.LivekitClient.Room();
      window.smokeRoom = room;
      window.smokeTracks = { audio: false, video: false };
      window.smokeMediaReceived = { audio: false, video: false };
      room.on(window.LivekitClient.RoomEvent.TrackSubscribed, track => {
        window.smokeTracks[track.kind] = true;
        const element = track.attach();
        document.body.appendChild(element);
        if (track.kind === 'video') {
          setInterval(() => { window.smokeMediaReceived.video ||= element.videoWidth > 0 && element.readyState >= 2; }, 100);
        } else {
          const listener = new AudioContext();
          const analyser = listener.createAnalyser();
          listener.createMediaStreamSource(new MediaStream([track.mediaStreamTrack])).connect(analyser);
          const levels = new Uint8Array(analyser.frequencyBinCount);
          setInterval(() => {
            analyser.getByteFrequencyData(levels);
            window.smokeMediaReceived.audio ||= levels.some(level => level > 0);
          }, 100);
        }
      });
      await room.connect(url, accessToken);
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 180;
      const drawing = canvas.getContext('2d');
      drawing.fillStyle = 'blue'; drawing.fillRect(0, 0, 320, 180);
      const video = canvas.captureStream(10).getVideoTracks()[0];
      setInterval(() => { drawing.fillStyle = drawing.fillStyle === '#0000ff' ? 'red' : 'blue'; drawing.fillRect(0, 0, 320, 180); }, 100);
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const destination = audioContext.createMediaStreamDestination();
      oscillator.frequency.value = 440;
      oscillator.connect(destination); oscillator.start();
      window.smokeMedia = { video, audioContext, oscillator };
      await room.localParticipant.publishTrack(destination.stream.getAudioTracks()[0], { source: window.LivekitClient.Track.Source.Microphone });
      await room.localParticipant.publishTrack(video, { source: window.LivekitClient.Track.Source.Camera });
    }, { url: socketUrl, accessToken: token(identity, { room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishSources: ['camera', 'microphone'] }) });
    pages.push(page);
  }
  for (const page of pages) {
    try {
      await page.waitForFunction(() => window.smokeRoom?.remoteParticipants.size === 1 && window.smokeMediaReceived?.audio && window.smokeMediaReceived?.video, null, { timeout: 30000 });
    } catch (error) {
      const states = await Promise.all(pages.map(item => item.evaluate(() => ({
        state: window.smokeRoom?.state,
        remoteParticipants: window.smokeRoom?.remoteParticipants.size,
        localAudio: window.smokeRoom?.localParticipant.audioTrackPublications.size,
        localVideo: window.smokeRoom?.localParticipant.videoTrackPublications.size,
        remoteAudio: [...(window.smokeRoom?.remoteParticipants.values() || [])].flatMap(peer => [...peer.audioTrackPublications.values()].map(track => track.isSubscribed)),
        remoteVideo: [...(window.smokeRoom?.remoteParticipants.values() || [])].flatMap(peer => [...peer.videoTrackPublications.values()].map(track => track.isSubscribed)),
        received: window.smokeTracks,
        mediaReceived: window.smokeMediaReceived,
      }))));
      console.error('Media smoke state:', JSON.stringify(states));
      throw error;
    }
  }
  console.log('PASS two Chrome participants received video frames and audio signal through LiveKit.');
} finally {
  await browser?.close().catch(() => undefined);
  await new Promise(resolve => server.close(resolve));
  if (created) {
    for (const identity of ['smoke-dentist', 'smoke-patient']) {
      try { await roomRequest('RemoveParticipant', { room: roomName, identity, revoke_token_ts: Math.floor(Date.now() / 1000) }, { roomAdmin: true, room: roomName }); } catch { /* Room deletion follows. */ }
    }
    try { await roomRequest('DeleteRoom', { room: roomName }, { roomCreate: true }); }
    catch { console.error('Smoke room cleanup failed; its five-minute tokens will expire.'); }
  }
}
