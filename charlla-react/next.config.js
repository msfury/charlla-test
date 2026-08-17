/**
 * 이 모듈을 단독으로 띄울 때 쓰는 설정.
 *
 * rewrites 규칙 자체는 next.config.charlla.js 에서 가져온다.
 * 기존 Next 앱에 이식할 때 복사해 가는 것도 그 파일이므로,
 * 규칙이 두 벌로 갈라지지 않도록 여기서는 import 만 한다.
 */
const { charllaRewrites } = require('./next.config.charlla.js');

/** @type {import('next').NextConfig} */
module.exports = {
  rewrites: charllaRewrites,
};
