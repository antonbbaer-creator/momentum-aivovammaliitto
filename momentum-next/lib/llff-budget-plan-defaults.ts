// LLFF 2026 budjettisuunnitelma — siemen PDF:stä
// (Realistinen budjetti 2026 — myönnetyt rahat ja arvioidut kulut, ilman
// henkilökohtaisia apurahoja). Lähde: budjetti_…realistinen budjetti 2026.pdf

import type { BudgetPlan } from './budget-plan-shared';

const id = (s: string) => `bp_llff_${s}`;

export const LLFF_BUDGET_PLAN_2026: BudgetPlan = {
  income: [
    { id: id('inc_hki'),    name: 'Helsingin kaupungin kehittämisavustus', amount: 12000 },
    { id: id('inc_kone'),   name: 'Kone',                                  amount: 15525 },
    { id: id('inc_jaama'),  name: 'Jäämä vuodelta 2025',                   amount: 1100 },
    { id: id('inc_yle'),    name: 'YLE',                                   amount: 1740 },
  ],
  expenses: [
    { id: id('exp_axel'),       name: 'AXEL (3 kangasta, 2 DCP)',                 amount: 4000,    vat: 1020 },
    { id: id('exp_proj_lyh'),   name: 'Projektori lyhärit',                       amount: 300,     vat: 76.5 },
    { id: id('exp_valtteri'),   name: 'Valtteri',                                  amount: 600 },
    { id: id('exp_kirjanp'),    name: 'Kirjanpito ja raportointi',                amount: 796.81,  vat: 203.19 },
    { id: id('exp_matkat'),     name: 'Elokuvaohjaajien matkakulut',              amount: 2000 },
    { id: id('exp_network'),    name: 'Networking event',                          amount: 500 },
    { id: id('exp_airbnb'),     name: 'Airbnb',                                    amount: 1500 },
    { id: id('exp_musa'),       name: 'Musiikkiesiintyjäpalkkio',                 amount: 1500 },
    { id: id('exp_teltta'),     name: 'Ulkoilmateltta',                            amount: 4780.9,  vat: 1219.1 },
    { id: id('exp_esitys'),     name: 'Elokuvien esitysluvat',                    amount: 2550 },
    { id: id('exp_catring'),    name: 'Catring',                                   amount: 1500 },
    { id: id('exp_katsomo'),    name: 'Nouseva katsomo',                          amount: 2500,    vat: 637.5 },
    { id: id('exp_markk'),      name: 'Markkinointikulut',                         amount: 2000 },
    { id: id('exp_betoni'),     name: 'Betonipossut',                              amount: 380,     vat: 96.9 },
    { id: id('exp_aani'),       name: 'Äänikalusto',                               amount: 1500 },
    { id: id('exp_tuoli'),      name: 'Tuoliyhteistyö',                            amount: 210.25,  vat: 53.61 },
    { id: id('exp_teosto'),     name: 'Teosto',                                    amount: 225 },
    { id: id('exp_pankki'),     name: 'Pankki & zoner',                            amount: 400 },
    { id: id('exp_bensa'),      name: 'Bensa',                                     amount: 50 },
    { id: id('exp_paku'),       name: 'Paku',                                      amount: 1000 },
    { id: id('exp_toim'),       name: 'Toiminnantarkastus',                        amount: 50 },
    { id: id('exp_festkayn'),   name: 'Festivaalikäynnit',                         amount: 1500 },
    { id: id('exp_sali'),       name: 'Elokuvasali (esim Orion)',                  amount: 4000 },
    { id: id('exp_vakuutus'),   name: 'Festivaalivakuutus',                        amount: 1000 },
    { id: id('exp_seka'),       name: 'Sekalainen (esim. taksit, yrityssoitot, postit yms)', amount: 150 },
    { id: id('exp_now'),        name: 'Now-työpajan kulut',                        amount: 2000 },
  ],
  // Koneen Säätiö 11.12.2025 — 2026 (1. vuosi). Yht. 34 425 €.
  // Lähde: Koneen Säätiö LLFF (1).pdf
  personalGrants: [
    { id: id('pg_anton_2026'), name: 'Anton Baer — Koneen Säätiö (9kk × 75% × 2 700 €)',   amount: 18225 },
    { id: id('pg_siiri_2026'), name: 'Siiri Siltala — Koneen Säätiö (4kk × 75% × 2 700 €)', amount: 8100 },
    { id: id('pg_hanna_2026'), name: 'Hanna Hovitie — Koneen Säätiö (4kk × 75% × 2 700 €)', amount: 8100 },
  ],
};
