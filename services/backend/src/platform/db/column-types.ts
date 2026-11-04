import { customType } from 'drizzle-orm/pg-core';

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

export const geography = customType<{ data: string; driverData: string }>({
  dataType: () => 'geography',
  toDriver: (value) => value,
  fromDriver: (value) => value,
});
