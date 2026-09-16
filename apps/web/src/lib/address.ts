import type { AddressDto } from '@spms/shared';

/** Address as display lines, skipping blanks: street, street 2, "City, State Postcode", country. */
export function addressLines(address: AddressDto | null | undefined): string[] {
  if (!address) return [];
  const cityLine = [address.city, [address.state, address.postalCode].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return [address.attention, address.line1, address.line2, cityLine, address.country].filter(
    (line): line is string => Boolean(line),
  );
}
