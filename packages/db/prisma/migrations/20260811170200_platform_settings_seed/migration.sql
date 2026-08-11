INSERT INTO "platform_settings" ("key", "value", "updated_at")
VALUES ('product_name', 'Prompter', now())
ON CONFLICT ("key") DO NOTHING;
