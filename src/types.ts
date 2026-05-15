/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PurchaseRecord {
  id?: string;
  felhasznalo_azonosito: string;
  korcsoport: string;
  nem: string;
  preferalt_webaruhaz: string;
  atlagos_havi_koltes_inr: string;
  hasznalt_eszkoz: string;
  fizetesi_mod: string;
  vasarlasi_gyakorisag: string;
  visszakuldesi_arany_szazalek: number;
  vasarolt_aru: string;
}

export interface FilterOptions {
  korcsoport: string;
  nem: string;
  webáruház: string;
  vásároltÁru: string;
  rendelésiEszköz: string;
  fizetésiMód: string;
  searchTerm: string;
}

export interface KPIStats {
  popularStore: string;
  dominantCategory: string;
  commonPayment: string;
  averageReturnRate: number;
  commonDevice: string;
  dominantFrequency: string;
}
