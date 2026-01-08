import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import "dotenv/config";


const prisma = new PrismaClient();

const companies = [
  {
    name: "Google (DeepMind / ML Infra)",
    website: "https://careers.google.com",
    hq: "USA",
    stage: "big-tech",
    tags: "ai-infra,distributed-systems",
    starred: true,
  },
  {
    name: "Meta (AI Infra)",
    website: "https://www.metacareers.com",
    hq: "USA",
    stage: "big-tech",
    tags: "ai-infra,training,inference",
    starred: true,
  },
  {
    name: "Amazon (AWS AI/ML)",
    website: "https://www.amazon.jobs",
    hq: "USA",
    stage: "big-tech",
    tags: "gpu,platform",
    starred: true,
  },
  {
    name: "Microsoft (Azure AI)",
    website: "https://jobs.careers.microsoft.com",
    hq: "USA",
    stage: "big-tech",
    tags: "gpu,cloud",
    starred: true,
  },
  {
    name: "Apple (AIML)",
    website: "https://jobs.apple.com",
    hq: "USA",
    stage: "big-tech",
    tags: "on-device-ai,infra",
    starred: false,
  },
  {
    name: "NVIDIA",
    website: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
    hq: "USA",
    stage: "big-tech",
    tags: "cuda,gpu,systems",
    starred: true,
  },
  {
    name: "OpenAI",
    website: "https://openai.com/careers",
    hq: "USA",
    stage: "late-stage",
    tags: "foundation-models,infra",
    starred: true,
  },
  {
    name: "Anthropic",
    website: "https://www.anthropic.com/careers",
    hq: "USA",
    stage: "late-stage",
    tags: "foundation-models,infra",
    atsType: "greenhouse",
    atsKey: "anthropic",
    starred: true,
  },
  {
    name: "xAI",
    website: "https://x.ai/careers",
    hq: "USA",
    stage: "late-stage",
    tags: "foundation-models,gpu",
    starred: true,
  },
  {
    name: "Cohere",
    website: "https://cohere.com/careers",
    hq: "USA",
    stage: "late-stage",
    tags: "foundation-models,infra",
    starred: false,
  },
  {
    name: "CoreWeave",
    website: "https://www.coreweave.com/careers",
    hq: "USA",
    stage: "growth",
    tags: "gpu-cloud,ai-infra",
    atsType: "greenhouse",
    atsKey: "coreweave",
    starred: true,
  },
  {
    name: "Lambda",
    website: "https://lambdalabs.com/careers",
    hq: "USA",
    stage: "growth",
    tags: "gpu-cloud",
    starred: true,
  },
  {
    name: "Crusoe",
    website: "https://www.crusoe.ai/careers",
    hq: "USA",
    stage: "growth",
    tags: "gpu,energy,infra",
    atsType: "lever",
    atsKey: "crusoe",
    starred: true,
  },
  {
    name: "Together AI",
    website: "https://www.together.ai/careers",
    hq: "USA",
    stage: "series-b",
    tags: "open-models,infra",
    starred: true,
  },
  {
    name: "Weights & Biases",
    website: "https://wandb.ai/site/careers",
    hq: "USA",
    stage: "late-stage",
    tags: "mlops,platform",
    starred: true,
  },
  {
    name: "Scale AI",
    website: "https://scale.com/careers",
    hq: "USA",
    stage: "late-stage",
    tags: "data,platform",
    atsType: "greenhouse",
    atsKey: "scaleai",
    starred: false,
  },
  {
    name: "Databricks",
    website: "https://www.databricks.com/company/careers",
    hq: "USA",
    stage: "late-stage",
    tags: "distributed-systems,data",
    starred: true,
  },
  {
    name: "Snowflake (AI/ML)",
    website: "https://careers.snowflake.com",
    hq: "USA",
    stage: "public",
    tags: "data,infra",
    starred: false,
  },
  {
    name: "Anyscale (Ray)",
    website: "https://www.anyscale.com/careers",
    hq: "USA",
    stage: "series-c",
    tags: "ray,distributed",
    starred: true,
  },
  {
    name: "Modal",
    website: "https://modal.com/careers",
    hq: "USA",
    stage: "series-b",
    tags: "serverless,ai-infra",
    starred: false,
  },
  {
    name: "Replicate",
    website: "https://replicate.com/careers",
    hq: "USA",
    stage: "series-b",
    tags: "model-serving",
    starred: false,
  },
  {
    name: "Palantir",
    website: "https://www.palantir.com/careers/",
    hq: "USA",
    stage: "public",
    tags: "fde,enterprise",
    starred: true,
  },
  {
    name: "Anduril",
    website: "https://www.anduril.com/careers/",
    hq: "USA",
    stage: "late-stage",
    tags: "defense,ai-infra",
    starred: true,
  },
  {
    name: "Shield AI",
    website: "https://shield.ai/careers/",
    hq: "USA",
    stage: "late-stage",
    tags: "defense,autonomy",
    starred: false,
  },
];


function companyId(name) {
  return crypto.createHash("sha1").update(name).digest("hex");
}

async function main() {
  const ts = new Date();

  for (const c of companies) {
    const data = {
      id: companyId(c.name),          // REQUIRED
      name: c.name,
      website: c.website ?? null,
      hq: c.hq ?? null,
      stage: c.stage ?? null,
      tags: c.tags ?? null,
      atsType: c.atsType ?? null,
      atsKey: c.atsKey ?? null,
      starred: Boolean(c.starred),
      updatedAt: ts,                 // REQUIRED
      // createdAt will default to now()
    };

    await prisma.company.upsert({
      where: { name: c.name },
      create: data,
      update: data,
    });
  }

  console.log("✅ Seeded companies:", companies.length);
  // console.log("🔥 SEED FILE EXECUTED", new Date().toISOString());
  // console.log("DEBUG companies.length (top-level) =", companies.length);
  // console.log("DEBUG first company =", companies[0]?.name);


}

main()
  .catch((e) => { console.error("❌ Seed error:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
  // console.log("DEBUG companies.length (in main) =", companies.length);



// import { PrismaClient } from "@prisma/client";

// const prisma = new PrismaClient();

// const companies = [
//   {
//     "name": "Google (DeepMind / ML Infra)",
//     "website": "https://careers.google.com",
//     "hq": "USA",
//     "stage": "big-tech",
//     "tags": "ai-infra,distributed-systems",
//     "starred": true
//   },
//   {
//     "name": "Meta (AI Infra)",
//     "website": "https://www.metacareers.com",
//     "hq": "USA",
//     "stage": "big-tech",
//     "tags": "ai-infra,training,inference",
//     "starred": true
//   },
//   {
//     "name": "Amazon (AWS AI/ML)",
//     "website": "https://www.amazon.jobs",
//     "hq": "USA",
//     "stage": "big-tech",
//     "tags": "gpu,platform",
//     "starred": true
//   },
//   {
//     "name": "Microsoft (Azure AI)",
//     "website": "https://jobs.careers.microsoft.com",
//     "hq": "USA",
//     "stage": "big-tech",
//     "tags": "gpu,cloud",
//     "starred": true
//   },
//   {
//     "name": "Apple (AIML)",
//     "website": "https://jobs.apple.com",
//     "hq": "USA",
//     "stage": "big-tech",
//     "tags": "on-device-ai,infra",
//     "starred": false
//   },
//   {
//     "name": "NVIDIA",
//     "website": "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
//     "hq": "USA",
//     "stage": "big-tech",
//     "tags": "cuda,gpu,systems",
//     "starred": true
//   },
//   {
//     "name": "OpenAI",
//     "website": "https://openai.com/careers",
//     "hq": "USA",
//     "stage": "late-stage",
//     "tags": "foundation-models,infra",
//     "starred": true
//   },
//   {
//     "name": "Anthropic",
//     "website": "https://www.anthropic.com/careers",
//     "hq": "USA",
//     "stage": "late-stage",
//     "tags": "foundation-models,infra",
//     "atsType": "greenhouse",
//     "atsKey": "anthropic",
//     "starred": true
//   },
//   {
//     "name": "xAI",
//     "website": "https://x.ai/careers",
//     "hq": "USA",
//     "stage": "late-stage",
//     "tags": "foundation-models,gpu",
//     "starred": true
//   },
//   {
//     "name": "Cohere",
//     "website": "https://cohere.com/careers",
//     "hq": "USA",
//     "stage": "late-stage",
//     "tags": "foundation-models,infra",
//     "starred": false
//   },
//   {
//     "name": "CoreWeave",
//     "website": "https://www.coreweave.com/careers",
//     "hq": "USA",
//     "stage": "growth",
//     "tags": "gpu-cloud,ai-infra",
//     "atsType": "greenhouse",
//     "atsKey": "coreweave",
//     "starred": true
//   },
//   {
//     "name": "Lambda",
//     "website": "https://lambdalabs.com/careers",
//     "hq": "USA",
//     "stage": "growth",
//     "tags": "gpu-cloud",
//     "starred": true
//   },
//   {
//     "name": "Crusoe",
//     "website": "https://www.crusoe.ai/careers",
//     "hq": "USA",
//     "stage": "growth",
//     "tags": "gpu,energy,infra",
//     "atsType": "lever",
//     "atsKey": "crusoe",
//     "starred": true
//   },
//   {
//     "name": "Together AI",
//     "website": "https://www.together.ai/careers",
//     "hq": "USA",
//     "stage": "series-b",
//     "tags": "open-models,infra",
//     "starred": true
//   },
//   {
//     "name": "Weights & Biases",
//     "website": "https://wandb.ai/site/careers",
//     "hq": "USA",
//     "stage": "late-stage",
//     "tags": "mlops,platform",
//     "starred": true
//   },
//   {
//     "name": "Scale AI",
//     "website": "https://scale.com/careers",
//     "hq": "USA",
//     "stage": "late-stage",
//     "tags": "data,platform",
//     "atsType": "greenhouse",
//     "atsKey": "scaleai",
//     "starred": false
//   },
//   {
//     "name": "Databricks",
//     "website": "https://www.databricks.com/company/careers",
//     "hq": "USA",
//     "stage": "late-stage",
//     "tags": "distributed-systems,data",
//     "starred": true
//   },
//   {
//     "name": "Snowflake (AI/ML)",
//     "website": "https://careers.snowflake.com",
//     "hq": "USA",
//     "stage": "public",
//     "tags": "data,infra",
//     "starred": false
//   },
//   {
//     "name": "Anyscale (Ray)",
//     "website": "https://www.anyscale.com/careers",
//     "hq": "USA",
//     "stage": "series-c",
//     "tags": "ray,distributed",
//     "starred": true
//   },
//   {
//     "name": "Modal",
//     "website": "https://modal.com/careers",
//     "hq": "USA",
//     "stage": "series-b",
//     "tags": "serverless,ai-infra",
//     "starred": false
//   },
//   {
//     "name": "Replicate",
//     "website": "https://replicate.com/careers",
//     "hq": "USA",
//     "stage": "series-b",
//     "tags": "model-serving",
//     "starred": false
//   },
//   {
//     "name": "Palantir",
//     "website": "https://www.palantir.com/careers/",
//     "hq": "USA",
//     "stage": "public",
//     "tags": "fde,enterprise",
//     "starred": true
//   },
//   {
//     "name": "Anduril",
//     "website": "https://www.anduril.com/careers/",
//     "hq": "USA",
//     "stage": "late-stage",
//     "tags": "defense,ai-infra",
//     "starred": true
//   },
//   {
//     "name": "Shield AI",
//     "website": "https://shield.ai/careers/",
//     "hq": "USA",
//     "stage": "late-stage",
//     "tags": "defense,autonomy",
//     "starred": false
//   }
// ];

// async function main() {
//   for (const c of companies) {
//     await prisma.company.upsert({
//       where: { name: c.name },
//       create: c,
//       update: c,
//     });
//   }
//   console.log("Seeded companies:", companies.length);
// }

// main()
//   .catch((e) => { console.error(e); process.exit(1); })
//   .finally(async () => { await prisma.$disconnect(); });
