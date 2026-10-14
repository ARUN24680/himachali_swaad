import { cn } from '@pk/ui';
import logoDark from '@pk/ui/brand/logo-dark.png';
import logoLight from '@pk/ui/brand/logo-light.png';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'auto' | 'light' | 'dark';
}

const heightMap = {
  sm: 'h-7 w-auto',
  md: 'h-9 w-auto',
  lg: 'h-12 w-auto',
};

export function BrandLogo({ className, size = 'md', variant = 'auto' }: BrandLogoProps) {
  const hClass = heightMap[size];

  if (variant === 'light') {
    return <img src={logoLight} alt="Pahadi Khatki" className={cn(hClass, 'object-contain', className)} />;
  }

  if (variant === 'dark') {
    return <img src={logoDark} alt="Pahadi Khatki" className={cn(hClass, 'object-contain', className)} />;
  }

  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <img src={logoLight} alt="Pahadi Khatki" className={cn(hClass, 'object-contain dark:hidden')} />
      <img src={logoDark} alt="Pahadi Khatki" className={cn(hClass, 'hidden object-contain dark:block')} />
    </span>
  );
}
