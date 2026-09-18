import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import { fishImage } from '../../client/fishart';
export function Button({
  icon,
  tone,
  size,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: IconName; tone?: 'primary' | 'teal' | 'gold' | 'ghost'; size?: 'big' | 'icon' }) {
  return (
    <button type="button" className={`btn ${tone ?? ''} ${size ?? ''} ${className}`} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}
export function Panel({
  title,
  icon,
  onClose,
  children,
  footer,
  className = '',
  tabs,
  extra,
}: {
  title: string;
  icon?: IconName;
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  tabs?: ReactNode;
  // Sits in the header between the title and the close button: a coin count, a timer.
  extra?: ReactNode;
}) {
  return (
    <section className={`panel drawer ${className}`} aria-label={title}>
      <header>
        {icon && <Icon name={icon} />}
        <h2>{title}</h2>
        {extra}
        {onClose && <Button size="icon" aria-label="Close" icon="close" onClick={onClose} />}
      </header>
      {tabs}
      <div className="body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </section>
  );
}
export function Pill({ icon, children, tone = '', title }: { icon?: IconName; children: ReactNode; tone?: string; title?: string }) {
  return (
    <span className={`pill ${tone}`} title={title}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}
export function Chip({ icon, children, className = '' }: { icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <span className={`chip ${className}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button type="button" key={key} aria-pressed={value === key} onClick={() => onChange(key)}>
          {text}
        </button>
      ))}
    </div>
  );
}
// Head-left, tail-right: the conveyor runs that way and so does a fish being reeled in.
// Every species is its painting from the concept sheet, so the guide, the bag, the
// conveyor and a landed catch all show the same creature.
export function FishArt({ name, silhouette = false, size }: { name?: string; silhouette?: boolean; size?: number }) {
  // The export is static and the files are already small, so a plain img is the right element here.
  // oxlint-disable-next-line next/no-img-element
  return <img className={silhouette ? 'fishart silhouette' : 'fishart'} src={fishImage(name)} alt="" draggable={false} width={size} height={size ? Math.round(size * 0.66) : undefined} />;
}
