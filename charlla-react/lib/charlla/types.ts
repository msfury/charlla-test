/**
 * Charlla Player Web Interface v1.2.0 타입 정의
 *
 * build 가 `tsc -p tsconfig.build.json --noEmit && next build` 이므로
 * 타입이 깨지면 빌드가 통째로 실패한다. 액션/페이로드를 여기서 확정한다.
 */

export type CharllaPlayerType = 'displayer' | 'shoplayer' | 'playlist';

/** App → Player (in) */
export type CharllaInAction =
  | 'play'
  | 'pause'
  | 'seek'
  | 'mute'
  | 'pip'
  | 'mini'
  | 'like'
  | 'banner';

/** Player → App (out) */
export type CharllaOutAction =
  | 'load'
  | 'play'
  | 'pause'
  | 'end'
  | 'open'
  | 'share'
  | 'like';

export type CharllaAction = CharllaInAction | CharllaOutAction;

export interface CharllaBasePayload {
  /** video content key = contentDeployKey */
  key: string;
}

/* ------------------------- out payloads ------------------------- */

export interface LoadPayload extends CharllaBasePayload {
  title: string;
  type: CharllaPlayerType;
}

/** play / pause 의 out 방향에는 time 이 포함된다 */
export interface PlayStatePayload extends CharllaBasePayload {
  time?: number;
}

export interface EndPayload extends CharllaBasePayload {
  time: number;
}

/**
 * open / share 의 out payload.
 *
 * 인터페이스 문서는 `link` 라고 적었지만, 찰나 공식 샘플(postmessage-new.html)은 `url` 을 읽고
 * open 에는 `target` 까지 있다. 어느 쪽이 실제로 오는지 확정하지 못해 둘 다 optional 로 둔다.
 * 실제 이벤트를 받아 보면 이 주석부터 정리할 것.
 */
export interface LinkPayload extends CharllaBasePayload {
  url?: string;
  /** open 에만 있다 */
  target?: string;
  /** 인터페이스 문서 표기 */
  link?: string;
}

export interface LikePayload extends CharllaBasePayload {
  status: boolean;
}

/* ------------------------- in payloads ------------------------- */

export interface SeekPayload extends CharllaBasePayload {
  time: number;
}

export type ToggleMode = 'on' | 'off';

export interface ModePayload extends CharllaBasePayload {
  mode: ToggleMode;
}

/* ------------------------- banner ------------------------- */

export interface BannerProduct {
  type: 'product';
  title: string;
  image: string;
  url: string;
  price: number;
  discount_rate: number;
  currency_code: string;
}

export interface BannerStock {
  type: 'stock';
  image: string;
  name: string;
  rate: number;
  /** 0: 하락, 1: 무변동, 2: 상승 */
  compare: 0 | 1 | 2;
  link: string;
}

export interface BannerContent {
  type: 'content';
  image: string;
  content: string;
  link: string;
}

export type BannerItem = BannerProduct | BannerStock | BannerContent;

export interface BannerPayload extends CharllaBasePayload {
  title: string;
  data: BannerItem[];
}

/* ------------------------- message ------------------------- */

export interface CharllaMessage<P extends CharllaBasePayload = CharllaBasePayload> {
  action: CharllaAction;
  payload: P;
}

/** URL query 로 넘기는 플레이어 설정 (Interface v1.1.0+) */
export interface CharllaConfig {
  webview?: 'ios' | 'android';
  bannerLinkExternal?: boolean;
  bannerDefaultImage?: string;
  shareExternal?: boolean;
  customBanner?: boolean;
}

/** charlla-api 의 GET /api/player-url 응답 */
export interface PlayerUrlResponse {
  contentDeployKey: string;
  type: CharllaPlayerType;
  url: string;
  playerOrigin: string;
}

/** charlla-api 의 POST /api/upload (또는 /api/upload-url) 응답 */
export interface CharllaUploadResult {
  uploadFileKey: string;
  uploadUrl: string;
  progressUrl: string;
  /** 발급 후 30분 */
  expireTime: string;
}

/** charlla-api 의 GET /api/upload-progress 응답 */
export interface CharllaUploadProgress {
  /** 0~100. 100 은 "전송 완료"이지 "인코딩 완료"가 아니다 */
  progress: number;
}

/** charlla-api 의 GET /api/contents 응답 */
export interface CharllaContent {
  title: string;
  uploadFileKey: string;
  contentDeployKey: string;
  mediaUrl: string;
  width: number;
  height: number;
  createdAt: string;
}

export interface CharllaContentList {
  count: number;
  page: number;
  perPage: number;
  order: string;
  sort: string;
  contents: CharllaContent[];
}
