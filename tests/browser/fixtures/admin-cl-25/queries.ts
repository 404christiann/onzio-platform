async function read(kind:string,seasonId?:string){const response=await fetch("/__cl25__/read?kind="+kind+"&season="+(seasonId??""));const result=await response.json();if(result.error)throw Error(result.error);return result.data;}
export const fetchSeasons=()=>read("seasons");
export const fetchLeagueStandings=(_club:string,options?:{seasonId?:string})=>read("standings",options?.seasonId);
export const fetchClubBranding=async()=>({logoPath:"",inverseLogoPath:"",footerTagline:"Our community"});
export type ClubBranding={logoPath:string;inverseLogoPath:string;footerTagline:string};
