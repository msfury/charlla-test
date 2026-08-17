'use client';

// 파일 선택 / XHR 진행률 / video 메타데이터는 모두 브라우저 전용이다.

import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type {
  CharllaContent,
  CharllaContentList,
  CharllaUploadProgress,
  CharllaUploadResult,
} from '@/lib/charlla/types';

/** 찰나 제약. 초과하면 업로드는 되지만 콜백이 EXCESS_DURATION 으로 온다. */
const MAX_SECONDS = 60;
/** 정의서 권장은 1초 이상이지만 호출 제한이 분당 60회다. */
const TRANSFER_POLL_MS = 2000;
const CONTENT_POLL_MS = 3000;
const CONTENT_POLL_TRIES = 40;

interface Props {
  /** 인코딩까지 끝나 콘텐츠가 잡히면 호출된다 */
  onUploaded?: (content: CharllaContent) => void;
}

type Line = { text: string; tone: 'info' | 'ok' | 'error' | 'muted' };

export function CharllaUploader({ onUploaded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [done, setDone] = useState<CharllaContent | null>(null);

  const log = useCallback((text: string, tone: Line['tone'] = 'info') => {
    setLines((prev) => [...prev, { text, tone }]);
  }, []);

  /** 60초 초과를 브라우저에서 미리 걸러낸다. 못 읽으면 서버 판단에 맡긴다. */
  const readDuration = (file: File) =>
    new Promise<number | null>((resolve) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(v.duration);
      };
      v.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      v.src = url;
    });

  /** fetch 로는 업로드 진행률을 볼 수 없어 XHR 을 쓴다. */
  const postFile = (file: File) =>
    new Promise<CharllaUploadResult>((resolve, reject) => {
      const fd = new FormData();
      fd.append('title', title.trim());
      fd.append('file', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/charlla/upload');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setPercent(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as CharllaUploadResult);
          } catch {
            reject(new Error(`응답을 해석하지 못했습니다: ${xhr.responseText}`));
          }
        } else {
          reject(new Error(`HTTP ${xhr.status} ${xhr.responseText}`));
        }
      };
      xhr.onerror = () => reject(new Error('네트워크 오류'));
      xhr.send(fd);
    });

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const pollTransfer = async (progressUrl: string) => {
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(
          `/api/charlla/upload-progress?progressUrl=${encodeURIComponent(progressUrl)}`,
        );
        if (res.ok) {
          const { progress } = (await res.json()) as CharllaUploadProgress;
          if (progress >= 100) {
            log('전송 진행률 100%', 'ok');
            return;
          }
        }
      } catch {
        // 진행률 조회 실패는 치명적이지 않다. 계속 간다.
      }
      await wait(TRANSFER_POLL_MS);
    }
    log('전송 진행률이 100%에 도달하지 않았습니다.', 'muted');
  };

  /** 인코딩이 끝나야 콘텐츠로 조회된다. 콜백을 못 받는 망에서의 대체 경로다. */
  const pollContent = async (uploadFileKey: string): Promise<CharllaContent | null> => {
    for (let i = 0; i < CONTENT_POLL_TRIES; i++) {
      try {
        const res = await fetch(
          `/api/charlla/contents?keyword=${encodeURIComponent(uploadFileKey)}`,
        );
        if (res.ok) {
          const list = (await res.json()) as CharllaContentList;
          const hit = (list.contents ?? []).find((c) => c.uploadFileKey === uploadFileKey);
          if (hit) return hit;
        }
      } catch {
        // 무시하고 재시도
      }
      await wait(CONTENT_POLL_MS);
    }
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !title.trim()) return;

    setBusy(true);
    setLines([]);
    setDone(null);
    setPercent(0);

    try {
      const sec = await readDuration(file);
      if (sec != null) {
        log(`영상 길이 ${sec.toFixed(1)}초`);
        if (sec > MAX_SECONDS) {
          throw new Error(
            `${MAX_SECONDS}초를 넘습니다 (${sec.toFixed(1)}초). 찰나가 EXCESS_DURATION 으로 거부합니다.`,
          );
        }
      }

      log(`업로드 시작: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
      const issued = await postFile(file);
      log(`업로드 완료. uploadFileKey = ${issued.uploadFileKey}`, 'ok');

      await pollTransfer(issued.progressUrl);
      log('인코딩 대기 중… (완료돼야 목록에 뜬다)', 'muted');

      const content = await pollContent(issued.uploadFileKey);
      if (content?.contentDeployKey) {
        log(`인코딩 완료. contentDeployKey = ${content.contentDeployKey}`, 'ok');
        setDone(content);
        onUploaded?.(content);
      } else {
        log('아직 콘텐츠로 조회되지 않습니다. 인코딩이 끝나면 목록에 나타납니다.', 'muted');
      }
    } catch (err) {
      log(`실패: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const toneClass: Record<Line['tone'], string> = {
    info: 'text-foreground',
    ok: 'text-green-700 dark:text-green-400',
    error: 'text-red-700 dark:text-red-400',
    muted: 'text-muted-foreground',
  };

  return (
    <div className="max-w-xl rounded-lg border p-5">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="charlla-title" className="text-sm font-semibold">
            제목
          </label>
          <input
            id="charlla-title"
            type="text"
            maxLength={255}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 연동테스트 영상"
            required
            className="rounded-md border px-3 py-2 text-sm"
            data-testid="charlla-upload-title"
          />
          <span className="text-xs text-muted-foreground">255자까지</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="charlla-file" className="text-sm font-semibold">
            영상 파일
          </label>
          <input
            id="charlla-file"
            ref={fileRef}
            type="file"
            accept="video/*"
            required
            className="text-sm"
            data-testid="charlla-upload-file"
          />
          <span className="text-xs text-muted-foreground">
            60초 이내. 초과하면 찰나가 EXCESS_DURATION 으로 거부합니다.
          </span>
        </div>

        <div>
          <Button type="submit" disabled={busy} data-testid="charlla-upload-submit">
            {busy ? '업로드 중…' : '업로드'}
          </Button>
        </div>

        {percent !== null && busy && (
          <progress max={100} value={percent} className="w-full" />
        )}
      </form>

      {lines.length > 0 && (
        <div className="mt-4 flex flex-col gap-1 text-sm" data-testid="charlla-upload-log">
          {lines.map((l, i) => (
            <div key={i} className={toneClass[l.tone]}>
              {l.text}
            </div>
          ))}
        </div>
      )}

      {done?.contentDeployKey && (
        <div className="mt-4 flex gap-2">
          <a
            className="rounded-md border px-3 py-1.5 text-sm"
            href={`?key=${done.contentDeployKey}&type=shoplayer`}
          >
            shoplayer 로 재생
          </a>
          <a
            className="rounded-md border px-3 py-1.5 text-sm"
            href={`?key=${done.contentDeployKey}&type=displayer`}
          >
            displayer 로 재생
          </a>
        </div>
      )}
    </div>
  );
}
