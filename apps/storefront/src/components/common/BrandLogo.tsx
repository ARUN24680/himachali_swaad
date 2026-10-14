import Image from 'next/image';
import { cn } from '@pk/ui';
import logoDark from '@pk/ui/brand/logo-dark.png';
import logoLight from '@pk/ui/brand/logo-light.png';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  priority?: boolean;
}

const heightMap = {
  sm: 'h-7 w-auto',
  md: 'h-9 w-auto md:h-10',
  lg: 'h-12 w-auto md:h-14',
};

export function BrandLogo({ className, size = 'md', priority = true }: BrandLogoProps) {
  const hClass = heightMap[size];

  return (
    <span className={cn('relative inline-flex items-center', className)}>
      {/* Light theme logo directly imported from @pk/ui/brand */}
      <Image
        src={logoLight}
        alt="Pahadi Khatki"
        priority={priority}
        className={cn(hClass, 'object-contain dark:hidden')}
      />
      {/* Dark theme logo directly imported from @pk/ui/brand */}
      <Image
        src={logoDark}
        alt="Pahadi Khatki"
        priority={priority}
        className={cn(hClass, 'hidden object-contain dark:block')}
      />
    </span>
  );
}
