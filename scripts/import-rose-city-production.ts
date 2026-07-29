import { assertRoseCityProductionImportRetired } from "@/lib/migration/rose-city-production-import";

// This command intentionally has no Supabase client, credential input, SQL
// execution, Storage upload, or compensation path. It is retained only so an
// operator using the historical command receives an explicit fail-closed
// explanation instead of accidentally restoring retired production state.
assertRoseCityProductionImportRetired();
