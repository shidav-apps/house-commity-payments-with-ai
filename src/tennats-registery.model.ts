// the key is the tenent name and the value is the apartment number

export type TenantName = string;
export type ApartmentNumber = number;

export type TaxesAmount = number;
export type RenovationFundAmount = number;

export type ApartmentDetails = {
    taxes: TaxesAmount;
    renovationFundAmount: RenovationFundAmount;
    isRent: boolean;
}

export type TennacyType = 'Renter' | 'Owner' | 'Both';
export type Tennancy = {
    readonly apartmentNumber: ApartmentNumber;
    readonly tennancyType: TennacyType;
}

export type TennatsRegistery = {
    "all-tenants": TenantName[];
    "all-apartments": ApartmentNumber[];
    "tenant-apartment-map": Record<TenantName, Tennancy>;
    "apartment-detils": Record<ApartmentNumber, ApartmentDetails>;
}


