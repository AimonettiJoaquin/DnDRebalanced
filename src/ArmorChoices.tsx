import { armor } from "./rules";
import { useLanguage } from "./Language";
import { armorName, translate, type Locale } from "./i18n";

const categories = [
  { id: "light", label: "Light armor" },
  { id: "medium", label: "Medium armor" },
  { id: "heavy", label: "Heavy armor" },
] as const;
export function armorOptionLabel(
  item: (typeof armor)[number],
  locale: Locale,
  addPB: boolean,
) {
  return `${armorName(item, locale)} · ${translate("AC", locale)} ${item.base}${item.dexCap === null ? "" : ` + DEX (≤ +${item.dexCap})`}${addPB ? " + PB" : ""}${item.dexCap === null ? ` · ${translate("DEX ignored", locale)}` : ""}`;
}
export function ArmorOptions({ addPB }: { addPB: boolean }) {
  const { locale, t } = useLanguage();
  return (
    <>
      {categories.map((category) => (
        <optgroup key={category.id} label={t(category.label)}>
          {armor
            .filter((item) => item.category === category.id)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {armorOptionLabel(item, locale, addPB)}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );
}
export function ArmorGuide({ addPB }: { addPB: boolean }) {
  const { t } = useLanguage();
  return (
    <div className="armor-guide" aria-label={t("Armor category bonuses")}>
      <dl>
        <div>
          <dt>{t("Light armor")}</dt>
          <dd>{t("Base 11–12 + DEX (cap +3 or +4) + applicable PB.")}</dd>
        </div>
        <div>
          <dt>{t("Medium armor")}</dt>
          <dd>{t("Base 12–14 + DEX (cap +1 or +2) + applicable PB.")}</dd>
        </div>
        <div>
          <dt>{t("Heavy armor")}</dt>
          <dd>
            {t(
              "Base 14–16 + applicable PB. Ignore DEX completely, even negative DEX.",
            )}
          </dd>
        </div>
      </dl>
      <p>
        {t(
          "Natural armor always adds PB. Worn armor adds PB only with proficiency. Negative DEX still reduces light and medium AC.",
        )}
      </p>
      {!addPB && <p className="no-armor-pb">{t("No PB: not proficient")}</p>}
      <p>
        {t(
          "Then add the selected enhancement, shield and other confirmed AC effects.",
        )}
      </p>
    </div>
  );
}
