import { normalizeText } from "@/lib/utils";

export type FieldOfStudyOption = {
  id: string;
  label: string;
  normalizedName: string;
};

const FIELDS_OF_STUDY = [
  "Accounting",
  "Advertising",
  "Aerospace Engineering",
  "Anthropology",
  "Applied Mathematics",
  "Architecture",
  "Art History",
  "Biochemistry",
  "Biology",
  "Biomedical Engineering",
  "Business Administration",
  "Chemical Engineering",
  "Chemistry",
  "Civil Engineering",
  "Communications",
  "Computer Engineering",
  "Computer Information Systems",
  "Computer Science",
  "Construction Management",
  "Criminal Justice",
  "Cybersecurity",
  "Data Analytics",
  "Data Science",
  "Design",
  "Economics",
  "Education",
  "Electrical Engineering",
  "English",
  "Environmental Science",
  "Finance",
  "Graphic Design",
  "Health Administration",
  "History",
  "Hospitality Management",
  "Human Resources",
  "Industrial Engineering",
  "Information Technology",
  "International Relations",
  "Journalism",
  "Kinesiology",
  "Legal Studies",
  "Management",
  "Marketing",
  "Mathematics",
  "Mechanical Engineering",
  "Music",
  "Neuroscience",
  "Nursing",
  "Operations Management",
  "Philosophy",
  "Physics",
  "Political Science",
  "Psychology",
  "Public Administration",
  "Public Health",
  "Sociology",
  "Software Engineering",
  "Supply Chain Management",
  "Theater",
  "UX Design"
].map((label) => ({
  id: normalizeText(label).replace(/\s+/g, "-"),
  label,
  normalizedName: normalizeText(label)
}));

export function searchFieldsOfStudy(query: string): FieldOfStudyOption[] {
  const normalizedQuery = normalizeText(query);
  return FIELDS_OF_STUDY.filter((field) => {
    if (!normalizedQuery) return true;
    return normalizeText([field.label, field.normalizedName].join(" ")).includes(normalizedQuery);
  });
}
