import { CharllaPlayer } from '@/components/charlla/CharllaPlayer';
import { CharllaUploader } from '@/components/charlla/CharllaUploader';
import type { CharllaPlayerType } from '@/lib/charlla/types';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: { key?: string; type?: string };
}

export default function CharllaTestPage({ searchParams }: Props) {
  const key = searchParams.key;
  const type = (searchParams.type as CharllaPlayerType) ?? 'shoplayer';

  if (!key) {
    return (
      <main className="p-6">
        <h1 className="mb-1 text-xl font-semibold">찰나 업로드 &amp; 플레이어 테스트</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          영상을 올리면 인코딩이 끝나는 대로 재생 링크가 나타납니다.
          <br />
          이미 배포키가 있다면 <code>?key=&#123;contentDeployKey&#125;</code> 로 바로 접속해도 됩니다.
        </p>
        <CharllaUploader />
      </main>
    );
  }

  return (
    <main className="p-6">
      <h1 className="mb-1 text-xl font-semibold">찰나 플레이어 테스트</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        key: <b>{key}</b> / type: <b>{type}</b>
        {' · '}
        <a className="underline" href="?">
          새 영상 업로드
        </a>
      </p>
      <CharllaPlayer contentKey={key} type={type} />
    </main>
  );
}
