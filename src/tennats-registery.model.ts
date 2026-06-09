// the key is the tenent name and the value is the apartment number

export type TenantName = string;
export type ApartmentNumber = number;

export type TennatsRegistery = {
    "all-tenants": TenantName[];
    "all-apartments": ApartmentNumber[];
    "tenant-apartment-map": Record<TenantName, ApartmentNumber>;
}

