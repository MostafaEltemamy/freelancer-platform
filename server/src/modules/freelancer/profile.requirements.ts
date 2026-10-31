interface ProfileRequirements {
  headline: string | null;
  bio: string | null;
  countryCode: string | null;
}

export function getMissingProfileFields(
  profile: ProfileRequirements,
): string[] {
  const missing: string[] = [];

  if (!profile.headline || profile.headline.trim().length < 10) {
    missing.push('headline');
  }

  if (!profile.bio || profile.bio.trim().length < 30) {
    missing.push('bio');
  }

  if (
    !profile.countryCode ||
    !/^[A-Z]{2}$/.test(profile.countryCode)
  ) {
    missing.push('countryCode');
  }

  return missing;
}
