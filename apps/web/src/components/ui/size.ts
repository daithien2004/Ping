export type PingSize = 'sm' | 'md' | 'lg';
export type PingCompactSize = Exclude<PingSize, 'lg'>;

const ANTD_SIZE = { sm: 'small', md: 'middle', lg: 'large' } as const;

export const toAntdSize = <S extends PingSize>(size: S) => ANTD_SIZE[size];
