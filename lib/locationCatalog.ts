import { LocationPreference } from "@/types";

import { normalizeText } from "@/lib/utils";

export type StateOption = {
  code: string;
  name: string;
  country: string;
};

export const US_STATE_OPTIONS: StateOption[] = [
  { code: "AL", name: "Alabama", country: "United States" },
  { code: "AK", name: "Alaska", country: "United States" },
  { code: "AZ", name: "Arizona", country: "United States" },
  { code: "AR", name: "Arkansas", country: "United States" },
  { code: "CA", name: "California", country: "United States" },
  { code: "CO", name: "Colorado", country: "United States" },
  { code: "CT", name: "Connecticut", country: "United States" },
  { code: "DE", name: "Delaware", country: "United States" },
  { code: "DC", name: "District of Columbia", country: "United States" },
  { code: "FL", name: "Florida", country: "United States" },
  { code: "GA", name: "Georgia", country: "United States" },
  { code: "HI", name: "Hawaii", country: "United States" },
  { code: "ID", name: "Idaho", country: "United States" },
  { code: "IL", name: "Illinois", country: "United States" },
  { code: "IN", name: "Indiana", country: "United States" },
  { code: "IA", name: "Iowa", country: "United States" },
  { code: "KS", name: "Kansas", country: "United States" },
  { code: "KY", name: "Kentucky", country: "United States" },
  { code: "LA", name: "Louisiana", country: "United States" },
  { code: "ME", name: "Maine", country: "United States" },
  { code: "MD", name: "Maryland", country: "United States" },
  { code: "MA", name: "Massachusetts", country: "United States" },
  { code: "MI", name: "Michigan", country: "United States" },
  { code: "MN", name: "Minnesota", country: "United States" },
  { code: "MS", name: "Mississippi", country: "United States" },
  { code: "MO", name: "Missouri", country: "United States" },
  { code: "MT", name: "Montana", country: "United States" },
  { code: "NE", name: "Nebraska", country: "United States" },
  { code: "NV", name: "Nevada", country: "United States" },
  { code: "NH", name: "New Hampshire", country: "United States" },
  { code: "NJ", name: "New Jersey", country: "United States" },
  { code: "NM", name: "New Mexico", country: "United States" },
  { code: "NY", name: "New York", country: "United States" },
  { code: "NC", name: "North Carolina", country: "United States" },
  { code: "ND", name: "North Dakota", country: "United States" },
  { code: "OH", name: "Ohio", country: "United States" },
  { code: "OK", name: "Oklahoma", country: "United States" },
  { code: "OR", name: "Oregon", country: "United States" },
  { code: "PA", name: "Pennsylvania", country: "United States" },
  { code: "RI", name: "Rhode Island", country: "United States" },
  { code: "SC", name: "South Carolina", country: "United States" },
  { code: "SD", name: "South Dakota", country: "United States" },
  { code: "TN", name: "Tennessee", country: "United States" },
  { code: "TX", name: "Texas", country: "United States" },
  { code: "UT", name: "Utah", country: "United States" },
  { code: "VT", name: "Vermont", country: "United States" },
  { code: "VA", name: "Virginia", country: "United States" },
  { code: "WA", name: "Washington", country: "United States" },
  { code: "WV", name: "West Virginia", country: "United States" },
  { code: "WI", name: "Wisconsin", country: "United States" },
  { code: "WY", name: "Wyoming", country: "United States" }
];

type LocationSeed = {
  city: string;
  stateProvince: string;
  country?: string;
  aliases?: string[];
};

function buildCityOption(seed: LocationSeed): LocationPreference {
  const country = seed.country ?? "United States";
  const stateLabel = US_STATE_OPTIONS.find((option) => option.code === seed.stateProvince)?.name ?? seed.stateProvince;
  return {
    type: "city",
    city: seed.city,
    stateProvince: seed.stateProvince,
    country,
    label: [seed.city, stateLabel, country].filter(Boolean).join(", "),
    normalizedKey: normalizeText([seed.city, seed.stateProvince, country].join("-")).replace(/\s+/g, "-"),
    aliases: seed.aliases
  };
}

const US_CAPITALS: LocationSeed[] = [
  { city: "Montgomery", stateProvince: "AL" },
  { city: "Juneau", stateProvince: "AK" },
  { city: "Phoenix", stateProvince: "AZ" },
  { city: "Little Rock", stateProvince: "AR" },
  { city: "Sacramento", stateProvince: "CA" },
  { city: "Denver", stateProvince: "CO" },
  { city: "Hartford", stateProvince: "CT" },
  { city: "Dover", stateProvince: "DE" },
  { city: "Washington", stateProvince: "DC" },
  { city: "Tallahassee", stateProvince: "FL" },
  { city: "Atlanta", stateProvince: "GA" },
  { city: "Honolulu", stateProvince: "HI" },
  { city: "Boise", stateProvince: "ID" },
  { city: "Springfield", stateProvince: "IL" },
  { city: "Indianapolis", stateProvince: "IN" },
  { city: "Des Moines", stateProvince: "IA" },
  { city: "Topeka", stateProvince: "KS" },
  { city: "Frankfort", stateProvince: "KY" },
  { city: "Baton Rouge", stateProvince: "LA" },
  { city: "Augusta", stateProvince: "ME" },
  { city: "Annapolis", stateProvince: "MD" },
  { city: "Boston", stateProvince: "MA", aliases: ["massachusetts"] },
  { city: "Lansing", stateProvince: "MI" },
  { city: "Saint Paul", stateProvince: "MN", aliases: ["st paul"] },
  { city: "Jackson", stateProvince: "MS" },
  { city: "Jefferson City", stateProvince: "MO" },
  { city: "Helena", stateProvince: "MT" },
  { city: "Lincoln", stateProvince: "NE" },
  { city: "Carson City", stateProvince: "NV" },
  { city: "Concord", stateProvince: "NH" },
  { city: "Trenton", stateProvince: "NJ" },
  { city: "Santa Fe", stateProvince: "NM" },
  { city: "Albany", stateProvince: "NY" },
  { city: "Raleigh", stateProvince: "NC" },
  { city: "Bismarck", stateProvince: "ND" },
  { city: "Columbus", stateProvince: "OH" },
  { city: "Oklahoma City", stateProvince: "OK" },
  { city: "Salem", stateProvince: "OR" },
  { city: "Harrisburg", stateProvince: "PA" },
  { city: "Providence", stateProvince: "RI" },
  { city: "Columbia", stateProvince: "SC" },
  { city: "Pierre", stateProvince: "SD" },
  { city: "Nashville", stateProvince: "TN" },
  { city: "Austin", stateProvince: "TX" },
  { city: "Salt Lake City", stateProvince: "UT" },
  { city: "Montpelier", stateProvince: "VT" },
  { city: "Richmond", stateProvince: "VA" },
  { city: "Olympia", stateProvince: "WA" },
  { city: "Charleston", stateProvince: "WV" },
  { city: "Madison", stateProvince: "WI" },
  { city: "Cheyenne", stateProvince: "WY" }
];

const MAJOR_US_CITIES: LocationSeed[] = [
  { city: "New York", stateProvince: "NY" },
  { city: "Los Angeles", stateProvince: "CA" },
  { city: "Chicago", stateProvince: "IL" },
  { city: "Houston", stateProvince: "TX" },
  { city: "Dallas", stateProvince: "TX" },
  { city: "San Antonio", stateProvince: "TX" },
  { city: "Fort Worth", stateProvince: "TX" },
  { city: "San Diego", stateProvince: "CA" },
  { city: "San Jose", stateProvince: "CA" },
  { city: "San Francisco", stateProvince: "CA" },
  { city: "Seattle", stateProvince: "WA" },
  { city: "Portland", stateProvince: "OR" },
  { city: "Las Vegas", stateProvince: "NV" },
  { city: "Miami", stateProvince: "FL" },
  { city: "Orlando", stateProvince: "FL" },
  { city: "Tampa", stateProvince: "FL" },
  { city: "Jacksonville", stateProvince: "FL" },
  { city: "Charlotte", stateProvince: "NC" },
  { city: "Durham", stateProvince: "NC" },
  { city: "Pittsburgh", stateProvince: "PA" },
  { city: "Philadelphia", stateProvince: "PA" },
  { city: "Cleveland", stateProvince: "OH" },
  { city: "Cincinnati", stateProvince: "OH" },
  { city: "Detroit", stateProvince: "MI" },
  { city: "Minneapolis", stateProvince: "MN" },
  { city: "Kansas City", stateProvince: "MO" },
  { city: "Saint Louis", stateProvince: "MO", aliases: ["st louis"] },
  { city: "New Orleans", stateProvince: "LA" },
  { city: "Boulder", stateProvince: "CO" },
  { city: "Colorado Springs", stateProvince: "CO" },
  { city: "Mesa", stateProvince: "AZ" },
  { city: "Tucson", stateProvince: "AZ" },
  { city: "Omaha", stateProvince: "NE" },
  { city: "Milwaukee", stateProvince: "WI" },
  { city: "Buffalo", stateProvince: "NY" },
  { city: "Rochester", stateProvince: "NY" },
  { city: "Newark", stateProvince: "NJ" },
  { city: "Jersey City", stateProvince: "NJ" },
  { city: "Baltimore", stateProvince: "MD" },
  { city: "Arlington", stateProvince: "VA" },
  { city: "Alexandria", stateProvince: "VA" },
  { city: "Birmingham", stateProvince: "AL" },
  { city: "Louisville", stateProvince: "KY" },
  { city: "Memphis", stateProvince: "TN" },
  { city: "Chattanooga", stateProvince: "TN" },
  { city: "Albuquerque", stateProvince: "NM" },
  { city: "El Paso", stateProvince: "TX" },
  { city: "Fresno", stateProvince: "CA" },
  { city: "Oakland", stateProvince: "CA" },
  { city: "Long Beach", stateProvince: "CA" },
  { city: "Riverside", stateProvince: "CA" },
  { city: "Anchorage", stateProvince: "AK" },
  { city: "Bossier City", stateProvince: "LA" },
  { city: "Spokane", stateProvince: "WA" },
  { city: "Tacoma", stateProvince: "WA" },
  { city: "Greenville", stateProvince: "SC" },
  { city: "Savannah", stateProvince: "GA" },
  { city: "Knoxville", stateProvince: "TN" },
  { city: "Reno", stateProvince: "NV" }
];

const INTERNATIONAL_CITIES: LocationSeed[] = [
  { city: "Toronto", stateProvince: "Ontario", country: "Canada" },
  { city: "Vancouver", stateProvince: "British Columbia", country: "Canada" },
  { city: "Montreal", stateProvince: "Quebec", country: "Canada" },
  { city: "Calgary", stateProvince: "Alberta", country: "Canada" },
  { city: "London", stateProvince: "England", country: "United Kingdom" },
  { city: "Manchester", stateProvince: "England", country: "United Kingdom" },
  { city: "Birmingham", stateProvince: "England", country: "United Kingdom" },
  { city: "Boston", stateProvince: "Lincolnshire", country: "United Kingdom" },
  { city: "Edinburgh", stateProvince: "Scotland", country: "United Kingdom" },
  { city: "Dublin", stateProvince: "Leinster", country: "Ireland" },
  { city: "Berlin", stateProvince: "Berlin", country: "Germany" },
  { city: "Munich", stateProvince: "Bavaria", country: "Germany" },
  { city: "Amsterdam", stateProvince: "North Holland", country: "Netherlands" },
  { city: "Paris", stateProvince: "Ile-de-France", country: "France" },
  { city: "Madrid", stateProvince: "Community of Madrid", country: "Spain" },
  { city: "Barcelona", stateProvince: "Catalonia", country: "Spain" },
  { city: "Zurich", stateProvince: "Zurich", country: "Switzerland" },
  { city: "Singapore", stateProvince: "Central Singapore", country: "Singapore" },
  { city: "Sydney", stateProvince: "New South Wales", country: "Australia" },
  { city: "Melbourne", stateProvince: "Victoria", country: "Australia" },
  { city: "Auckland", stateProvince: "Auckland", country: "New Zealand" },
  { city: "Tokyo", stateProvince: "Tokyo", country: "Japan" },
  { city: "Osaka", stateProvince: "Osaka", country: "Japan" },
  { city: "Seoul", stateProvince: "Seoul", country: "South Korea" },
  { city: "Bengaluru", stateProvince: "Karnataka", country: "India", aliases: ["bangalore"] },
  { city: "Mumbai", stateProvince: "Maharashtra", country: "India" },
  { city: "Sao Paulo", stateProvince: "Sao Paulo", country: "Brazil" },
  { city: "Mexico City", stateProvince: "Mexico City", country: "Mexico" },
  { city: "Cape Town", stateProvince: "Western Cape", country: "South Africa" }
];

const CITY_OPTIONS = [...US_CAPITALS, ...MAJOR_US_CITIES, ...INTERNATIONAL_CITIES]
  .map(buildCityOption)
  .filter((option, index, items) => items.findIndex((entry) => entry.normalizedKey === option.normalizedKey) === index);

export const SPECIAL_LOCATION_OPTIONS: LocationPreference[] = [
  { type: "anywhere", label: "Anywhere", city: "", stateProvince: "", country: "", normalizedKey: "anywhere" },
  { type: "remote", label: "Remote", city: "", stateProvince: "", country: "", normalizedKey: "remote" }
];

function stateNameForCode(stateProvince: string) {
  return US_STATE_OPTIONS.find((option) => option.code === stateProvince)?.name ?? stateProvince;
}

export function getLocationDisplay(location: Pick<LocationPreference, "type" | "label" | "city" | "stateProvince" | "country">) {
  if (location.label) return location.label;
  if (location.type === "remote") return "Remote";
  if (location.type === "anywhere") return "Anywhere";
  return [location.city, stateNameForCode(location.stateProvince), location.country].filter(Boolean).join(", ");
}

export function searchCities(query: string, countryFilter?: string) {
  const normalizedQuery = normalizeText(query);
  return CITY_OPTIONS.filter((option) => {
    if (countryFilter && option.country !== countryFilter) return false;
    if (!normalizedQuery) return true;
    const haystack = normalizeText([option.label, option.city, option.stateProvince, option.country, ...(option.aliases ?? [])].join(" "));
    return haystack.includes(normalizedQuery);
  });
}

export function searchLocationPreferences(query: string) {
  const normalizedQuery = normalizeText(query);
  const options = [...SPECIAL_LOCATION_OPTIONS, ...CITY_OPTIONS];
  return options.filter((option) => {
    if (!normalizedQuery) return true;
    return normalizeText([option.label, option.city, option.stateProvince, option.country, ...(option.aliases ?? [])].join(" ")).includes(normalizedQuery);
  });
}
