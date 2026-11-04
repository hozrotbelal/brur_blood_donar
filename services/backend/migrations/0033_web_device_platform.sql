-- Staff web portal sessions are recorded as devices with platform 'web'
ALTER TYPE device_platform ADD VALUE IF NOT EXISTS 'web';
