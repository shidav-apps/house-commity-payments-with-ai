// the key is the tenent name and the value is the apartment number

export type TenantName = string;
export type ApartmentNumber = number;

export type RentAmount = number;
export type RenovationFundAmount = number;

export type ApartmentDetails = {
    rentAmount: RentAmount;
    renovationFundAmount: RenovationFundAmount;
}


export type TennatsRegistery = {
    "all-tenants": TenantName[];
    "all-apartments": ApartmentNumber[];
    "tenant-apartment-map": Record<TenantName, ApartmentNumber>;
    "apartment-detils": Record<ApartmentNumber, ApartmentDetails>;
}


