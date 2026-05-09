/**
 * H1.partner.directory — 合作商 SKU 等（首期 stub）。
 */
export type PartnerSku = { id: string; name: string; partnerId: string };

export class StubPartnerDirectory {
  listSkus(_partnerId?: string): readonly PartnerSku[] {
    return [];
  }
}
