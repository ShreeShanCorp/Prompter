-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('none', 'platform_admin');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('member', 'owner');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('invited', 'active', 'removed');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'in_progress', 'ready_to_export', 'exported', 'delivered');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('md', 'docx', 'pdf');

-- CreateEnum
CREATE TYPE "CreditSource" AS ENUM ('free_hourly', 'purchased');

-- CreateEnum
CREATE TYPE "DeliveryTargetTool" AS ENUM ('claude_code', 'codex', 'antigravity', 'other');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('copy', 'api', 'mcp');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'success', 'failed');

-- CreateEnum
CREATE TYPE "CreditPack" AS ENUM ('starter_1usd_2credits', 'value_5usd_20credits');

-- CreateEnum
CREATE TYPE "CreditPurchaseStatus" AS ENUM ('pending', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('purchase_credit', 'free_export', 'paid_export_debit');

-- CreateTable
CREATE TABLE "orgs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "plan_tier" TEXT NOT NULL DEFAULT 'free',
    "status" "OrgStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orgs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "platform_role" "PlatformRole" NOT NULL DEFAULT 'none',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_memberships" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'member',
    "status" "MembershipStatus" NOT NULL DEFAULT 'invited',
    "invited_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "template_version" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_responses" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "section_1_identity" JSONB,
    "section_2_roles" JSONB,
    "section_3_domain_model" JSONB,
    "section_4_tech_stack" JSONB,
    "section_5_mvp_scope" JSONB,
    "section_6_nfr" JSONB,
    "section_7_integrations" JSONB,
    "section_8_ui_ux" JSONB,
    "section_9_dod" JSONB,
    "section_10_deliverables" JSONB,
    "section_11_phase_gate" JSONB,
    "section_12_special_instructions" TEXT,
    "completeness_pct" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exports" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "file_url" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "generated_by" TEXT NOT NULL,
    "credit_source" "CreditSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_records" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "export_id" TEXT,
    "target_tool" "DeliveryTargetTool" NOT NULL,
    "method" "DeliveryMethod" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "initiated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "stripe_customer_id" TEXT,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "last_free_export_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_purchases" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "purchased_by" TEXT NOT NULL,
    "pack" "CreditPack" NOT NULL,
    "credits_granted" INTEGER NOT NULL,
    "amount_usd" DECIMAL(10,2) NOT NULL,
    "stripe_payment_intent_id" TEXT NOT NULL,
    "status" "CreditPurchaseStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "related_export_id" TEXT,
    "related_credit_purchase_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_assist_requests" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "input_text" TEXT NOT NULL,
    "output_text" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokens_used" INTEGER,
    "cost_usd" DECIMAL(10,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_assist_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_access_log" (
    "id" TEXT NOT NULL,
    "platform_admin_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_access_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orgs_slug_key" ON "orgs"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "orgs_clerk_org_id_key" ON "orgs"("clerk_org_id");

-- CreateIndex
CREATE UNIQUE INDEX "members_clerk_user_id_key" ON "members"("clerk_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_memberships_org_id_member_id_key" ON "org_memberships"("org_id", "member_id");

-- CreateIndex
CREATE UNIQUE INDEX "template_responses_project_id_key" ON "template_responses"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_org_id_key" ON "wallets"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_purchases_stripe_payment_intent_id_key" ON "credit_purchases"("stripe_payment_intent_id");

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_responses" ADD CONSTRAINT "template_responses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exports" ADD CONSTRAINT "exports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exports" ADD CONSTRAINT "exports_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_export_id_fkey" FOREIGN KEY ("export_id") REFERENCES "exports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_initiated_by_fkey" FOREIGN KEY ("initiated_by") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_purchased_by_fkey" FOREIGN KEY ("purchased_by") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_related_export_id_fkey" FOREIGN KEY ("related_export_id") REFERENCES "exports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_related_credit_purchase_id_fkey" FOREIGN KEY ("related_credit_purchase_id") REFERENCES "credit_purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_assist_requests" ADD CONSTRAINT "ai_assist_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_assist_requests" ADD CONSTRAINT "ai_assist_requests_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_assist_requests" ADD CONSTRAINT "ai_assist_requests_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_access_log" ADD CONSTRAINT "admin_access_log_platform_admin_id_fkey" FOREIGN KEY ("platform_admin_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_access_log" ADD CONSTRAINT "admin_access_log_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
