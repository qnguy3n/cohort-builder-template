import type { PageServerLoad } from './$types';
import {
  listLivePatients,
  cuiCounts,
  institutionName,
  isLiveStoreAvailable,
} from '$lib/server/liveDb';

// POC tenant: Daniel Franc MD PhD
const DEFAULT_HOSPITAL_ID = 'danielfranc-md';

function num(v: string | null): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const load: PageServerLoad = ({ url }) => {
  const hospitalId = url.searchParams.get('hospitalId') || DEFAULT_HOSPITAL_ID;
  const selectedCuis = url.searchParams.getAll('cui');
  const gender = url.searchParams.get('gender') || null;
  const ageMin = num(url.searchParams.get('ageMin'));
  const ageMax = num(url.searchParams.get('ageMax'));
  const includePhi = url.searchParams.get('irb') === '1';

  if (!isLiveStoreAvailable()) {
    return {
      available: false,
      hospitalId,
      institution: null,
      patients: [],
      facets: [],
      selectedCuis,
      gender,
      ageMin,
      ageMax,
      includePhi,
    };
  }

  return {
    available: true,
    hospitalId,
    institution: institutionName(hospitalId),
    patients: listLivePatients({ hospitalId, cuis: selectedCuis, gender, ageMin, ageMax, includePhi }),
    facets: cuiCounts(hospitalId),
    selectedCuis,
    gender,
    ageMin,
    ageMax,
    includePhi,
  };
};
