'use client';

import * as React from 'react';

/**
 * 이 모듈을 단독으로 띄우기 위한 최소 Button.
 *
 * 이식 대상 앱에는 보통 shadcn/ui 의 Button 이 이미 있다.
 * 그 경우 이 파일은 복사하지 말 것. import 경로(@/components/ui/button)가
 * 같으므로 컴포넌트는 그대로 동작한다.
 *
 * 쓰는 props 는 size / variant 둘뿐이고 shadcn Button 과 이름을 맞춰 두었다.
 */
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: 'sm' | 'default';
  variant?: 'default' | 'outline' | 'destructive';
};

export function Button({ size = 'default', variant = 'default', style, ...props }: Props) {
  const base: React.CSSProperties = {
    padding: size === 'sm' ? '4px 10px' : '8px 16px',
    fontSize: size === 'sm' ? 13 : 14,
    borderRadius: 6,
    cursor: props.disabled ? 'not-allowed' : 'pointer',
    opacity: props.disabled ? 0.5 : 1,
    border: '1px solid #d4d4d8',
    background: variant === 'destructive' ? '#dc2626' : variant === 'outline' ? '#fff' : '#18181b',
    color: variant === 'outline' ? '#18181b' : '#fff',
  };
  return <button {...props} style={{ ...base, ...style }} />;
}
