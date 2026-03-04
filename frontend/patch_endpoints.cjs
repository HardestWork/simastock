const fs = require('fs');
const filePath = 'C:/Users/amado/Desktop/Systeme de gestion boutique/frontend/src/api/endpoints.ts';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update the import block — add new types to the existing import from './types'
const OLD_IMPORT_END = `  SellerSprint,
} from './types';`;
const NEW_IMPORT_END = `  SellerSprint,
  MultiPeriodRanking,
  CreditQuality,
  ProductMix,
  CoachingData,
} from './types';`;

if (!content.includes(OLD_IMPORT_END)) {
  console.error('ERROR: import end marker not found');
  process.exit(1);
}
content = content.replace(OLD_IMPORT_END, NEW_IMPORT_END);
console.log('Updated imports in endpoints.ts');

// 2. Add new endpoints after the recompute entry
const OLD_RECOMPUTE = `  recompute: (data: { period?: string; seller_id?: string; store?: string }) =>
    apiClient.post('objectives/recompute/', data).then((r) => r.data),
};`;

const NEW_RECOMPUTE = `  recompute: (data: { period?: string; seller_id?: string; store?: string }) =>
    apiClient.post('objectives/recompute/', data).then((r) => r.data),

  // Multi-period ranking
  ranking: (params?: { period?: string; store?: string }) =>
    apiClient.get<MultiPeriodRanking>('objectives/seller/ranking/', { params }).then((r) => r.data),

  // Credit quality
  creditQuality: (params?: { period?: string; store?: string }) =>
    apiClient.get<CreditQuality>('objectives/seller/credit-quality/', { params }).then((r) => r.data),

  // Product mix
  productMix: (params?: { period?: string; store?: string }) =>
    apiClient.get<ProductMix>('objectives/seller/product-mix/', { params }).then((r) => r.data),

  // Coaching missions
  coaching: (params?: { period?: string; store?: string }) =>
    apiClient.get<CoachingData>('objectives/seller/coaching/', { params }).then((r) => r.data),
};`;

if (!content.includes(OLD_RECOMPUTE)) {
  console.error('ERROR: recompute marker not found');
  process.exit(1);
}
content = content.replace(OLD_RECOMPUTE, NEW_RECOMPUTE);
console.log('Added 4 new API endpoints to objectiveApi');

fs.writeFileSync(filePath, content, 'utf8');
console.log('endpoints.ts saved successfully');
