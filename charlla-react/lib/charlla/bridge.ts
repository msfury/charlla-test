import type {
  BannerItem,
  CharllaBasePayload,
  CharllaInAction,
  CharllaMessage,
  ToggleMode,
} from './types';

type Handler = (payload: CharllaBasePayload, message: CharllaMessage) => void;

export interface CharllaBridge {
  send(action: CharllaInAction, payload?: Record<string, unknown>): boolean;
  on(action: string, handler: Handler): CharllaBridge;
  isReady(): boolean;
  /** 실제로 전송에 쓰이는 키. load 를 받았다면 그 값이다. */
  getKey(): string;
  destroy(): void;

  play(): boolean;
  pause(): boolean;
  seek(seconds: number): boolean;
  mute(on: boolean): boolean;
  pip(on: boolean): boolean;
  mini(on: boolean): boolean;
  like(status: boolean): boolean;
  banner(title: string, data: BannerItem[]): boolean;
}

/**
 * 찰나 플레이어 iframe 과 postMessage 로 통신하는 브릿지.
 *
 * 주의 두 가지
 *  1) load 액션을 받기 전에 보낸 메시지는 유실된다. isReady() 로 막을 것.
 *  2) destroy() 를 호출하지 않으면 언마운트 후에도 리스너가 남는다.
 */
export function createCharllaBridge(
  iframe: HTMLIFrameElement,
  contentKey: string,
  playerOrigin: string,
): CharllaBridge {
  const handlers = new Map<string, Handler[]>();
  const origin = playerOrigin || '*';
  let ready = false;

  /*
   * 재생 중인 콘텐츠 키.
   *
   * URL 로 CDK 를 확정할 수 있는 건 displayer(/{cdk})와 shoplayer(/shoplayer/{cdk})뿐이다.
   * list 계열은 URL 로 알 수 없고 load(out).payload.key 로만 확인된다.
   * 그래서 처음엔 넘겨받은 키로 시작하고, load 를 받으면 그 값으로 갱신한다.
   */
  let currentKey = contentKey;

  const send = (action: CharllaInAction, payload: Record<string, unknown> = {}): boolean => {
    const target = iframe.contentWindow;
    if (!target) return false;

    target.postMessage(
      JSON.stringify({ action, payload: { key: currentKey, ...payload } }),
      origin,
    );
    return true;
  };

  const dispatch = (key: string, message: CharllaMessage) => {
    handlers.get(key)?.forEach((h) => {
      try {
        h(message.payload, message);
      } catch (err) {
        console.error('[charlla-bridge] handler error', err);
      }
    });
  };

  const onMessage = (e: MessageEvent) => {
    // origin 검증이 없으면 아무 사이트나 메시지를 던질 수 있다.
    if (origin !== '*' && e.origin !== origin) return;

    let message: CharllaMessage;
    try {
      message = JSON.parse(e.data as string) as CharllaMessage;
    } catch {
      return; // 확장 프로그램 등 외부 메시지는 조용히 무시
    }
    if (!message?.action) return;

    if (message.action === 'load') {
      ready = true;
      const key = (message.payload as { key?: string })?.key;
      if (key) currentKey = key; // list 계열에서는 이게 정답이다
    }

    dispatch(message.action, message);
    dispatch('*', message);
  };

  window.addEventListener('message', onMessage);

  const bridge: CharllaBridge = {
    send,
    on(action, handler) {
      handlers.set(action, [...(handlers.get(action) ?? []), handler]);
      return bridge;
    },
    isReady: () => ready,
    getKey: () => currentKey,
    destroy() {
      window.removeEventListener('message', onMessage);
      handlers.clear();
      ready = false;
    },

    play: () => send('play'),
    pause: () => send('pause'),
    seek: (seconds: number) => send('seek', { time: seconds }),
    mute: (on: boolean) => send('mute', { mode: (on ? 'on' : 'off') as ToggleMode }),
    pip: (on: boolean) => send('pip', { mode: (on ? 'on' : 'off') as ToggleMode }),
    mini: (on: boolean) => send('mini', { mode: (on ? 'on' : 'off') as ToggleMode }),
    like: (status: boolean) => send('like', { status }),
    banner: (title: string, data: BannerItem[]) => send('banner', { title, data }),
  };

  return bridge;
}
