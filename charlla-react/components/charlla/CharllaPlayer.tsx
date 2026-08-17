'use client';

// iframe / useEffect / postMessage 는 모두 브라우저 전용이다.
// 'use client' 가 없으면 SSR 단계에서 window 접근으로 터진다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { createCharllaBridge, type CharllaBridge } from '@/lib/charlla/bridge';
import type {
  BannerItem,
  CharllaMessage,
  CharllaPlayerType,
  LoadPayload,
  PlayerUrlResponse,
} from '@/lib/charlla/types';

const SAMPLE_BANNER: BannerItem[] = [
  {
    type: 'product',
    title: '테스트 상품',
    image: 'https://picsum.photos/200/200',
    url: 'https://example.com/product/1',
    price: 19900,
    discount_rate: 10,
    currency_code: '₩',
  },
];

interface Props {
  contentKey: string;
  type?: CharllaPlayerType;
  width?: number;
  height?: number;
}

export function CharllaPlayer({
  contentKey,
  type = 'shoplayer',
  width = 360,
  height = 640,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<CharllaBridge | null>(null);

  const [player, setPlayer] = useState<PlayerUrlResponse | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const appendLog = useCallback((dir: string, text: string) => {
    const t = new Date().toISOString().substring(11, 23);
    setLogs((prev) => [...prev, `[${t}] ${dir} ${text}`]);
  }, []);

  // 1) 플레이어 URL 은 charlla-api 에서 받는다. 프론트가 조립하지 않는다.
  useEffect(() => {
    let aborted = false;

    fetch(`/api/charlla/player-url?key=${encodeURIComponent(contentKey)}&type=${type}`)
      .then((r) => {
        if (!r.ok) throw new Error(`player-url 조회 실패 (${r.status})`);
        return r.json() as Promise<PlayerUrlResponse>;
      })
      .then((d) => {
        if (!aborted) setPlayer(d);
      })
      .catch((e: Error) => {
        if (!aborted) setError(e.message);
      });

    return () => {
      aborted = true;
    };
  }, [contentKey, type]);

  // 2) iframe 이 뜬 뒤 브릿지를 연결한다.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !player) return;

    const bridge = createCharllaBridge(iframe, contentKey, player.playerOrigin);
    bridgeRef.current = bridge;

    bridge.on('*', (_payload, msg: CharllaMessage) => {
      appendLog('◀', JSON.stringify(msg));
    });
    bridge.on('load', (payload) => {
      const p = payload as LoadPayload;
      setReady(true);
      appendLog('  ', `→ 로드 완료: ${p.title} (${p.type})`);
    });
    bridge.on('end', (payload) => {
      appendLog('  ', `→ 재생 종료: ${(payload as { time: number }).time}초`);
    });

    // cleanup 을 빼면 언마운트 후에도 리스너가 남아 누적된다.
    return () => {
      bridge.destroy();
      bridgeRef.current = null;
      setReady(false);
    };
  }, [player, contentKey, appendLog]);

  const act = (label: string, fn: (b: CharllaBridge) => boolean) => () => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    fn(bridge);
    appendLog('▶', label);
  };

  if (error) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div>
        {player ? (
          <iframe
            ref={iframeRef}
            src={player.url}
            width={width}
            height={height}
            allow="autoplay; clipboard-write; web-share; picture-in-picture; fullscreen"
            referrerPolicy="origin"
            title="charlla-player"
            data-testid="charlla-iframe"
            className="rounded-lg border"
          />
        ) : (
          <div
            style={{ width, height }}
            className="flex items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground"
          >
            플레이어 URL 조회 중…
          </div>
        )}
      </div>

      <div className="min-w-[380px] flex-1">
        <p className="mb-3 text-sm text-muted-foreground" data-testid="charlla-status">
          상태: {ready ? 'load 수신 완료' : '로드 대기중…'}
        </p>

        <div className="mb-4 flex flex-wrap gap-2" data-testid="charlla-controls">
          <Button size="sm" disabled={!ready} onClick={act('play', (b) => b.play())}>
            재생
          </Button>
          <Button size="sm" disabled={!ready} onClick={act('pause', (b) => b.pause())}>
            일시정지
          </Button>
          <Button size="sm" disabled={!ready} onClick={act('seek 10', (b) => b.seek(10))}>
            10초로 이동
          </Button>
          <Button size="sm" disabled={!ready} onClick={act('mute on', (b) => b.mute(true))}>
            음소거
          </Button>
          <Button size="sm" disabled={!ready} onClick={act('mute off', (b) => b.mute(false))}>
            음소거 해제
          </Button>
          <Button size="sm" disabled={!ready} onClick={act('pip on', (b) => b.pip(true))}>
            PIP
          </Button>
          <Button size="sm" disabled={!ready} onClick={act('mini on', (b) => b.mini(true))}>
            미니
          </Button>
          <Button size="sm" disabled={!ready} onClick={act('like true', (b) => b.like(true))}>
            좋아요
          </Button>
          <Button
            size="sm"
            disabled={!ready}
            onClick={act('banner', (b) => b.banner('상품 정보', SAMPLE_BANNER))}
          >
            배너 주입
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLogs([])}>
            로그 지우기
          </Button>
        </div>

        <pre
          data-testid="charlla-log"
          className="h-80 overflow-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-100"
        >
          {logs.join('\n')}
        </pre>
      </div>
    </div>
  );
}
