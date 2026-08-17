/**
 * 이 모듈을 단독으로 띄울 때 쓰는 설정.
 * 기존 앱에 이식할 때는 그쪽 tailwind.config 를 쓰므로 복사하지 않는다.
 * 단, 컴포넌트가 shadcn 토큰(muted)을 쓰므로 그쪽에도 같은 토큰이 있어야 한다.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        muted: 'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
      },
    },
  },
  plugins: [],
};
