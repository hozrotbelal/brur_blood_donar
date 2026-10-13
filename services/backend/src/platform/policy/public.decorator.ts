import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'bbda:public';
export const Public = () => SetMetadata(IS_PUBLIC, true);
