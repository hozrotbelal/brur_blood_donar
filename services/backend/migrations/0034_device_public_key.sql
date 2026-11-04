-- Device binding (architecture 13.1): the app registers a P-256 public key per device; refresh and step-up proofs are signed with it.
ALTER TABLE idn.device ADD COLUMN public_key text;
ALTER TABLE idn.device ADD CONSTRAINT ck_device_public_key_pem CHECK (public_key IS NULL OR public_key LIKE '-----BEGIN PUBLIC KEY-----%');
