/**
 * 기존 next.config 에 아래 rewrites 를 합쳐 넣는다.
 *
 * 이렇게 하면 브라우저는 같은 오리진(3000)으로만 요청하므로
 * CORS 설정이 아예 필요 없다.
 *
 * 주의: 기존 프로젝트에 이미 rewrites 가 있으면 배열에 합치고,
 *       경로가 겹치지 않는지 먼저 확인할 것. (/api/charlla/ 로 네임스페이스를 뗀 이유)
 */
const charllaRewrites = async () => [
  {
    source: '/api/charlla/:path*',
    destination: `${process.env.CHARLLA_API_BASE ?? 'http://localhost:8080'}/api/:path*`,
  },
];

module.exports = { charllaRewrites };
