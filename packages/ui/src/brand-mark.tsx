export type BrandMarkProps = {
  context?: string;
};

export function BrandMark({ context }: BrandMarkProps) {
  return (
    <span className="kp-brand">
      <span aria-hidden="true" className="kp-brand__name">
        KORA<span className="kp-brand__plus">+</span>
      </span>
      <span className="kp-visually-hidden">KORA plus</span>
      {context ? <span className="kp-brand__context">{context}</span> : null}
    </span>
  );
}
