import { describe, expect, it } from "vitest";
import { normalizeDeliverectMenu } from "../src/server/providers/deliverectMenuNormalizer";

describe("normalizeDeliverectMenu", () => {
  it("converts a Deliverect menu payload into canonical menu records and mappings", () => {
    const result = normalizeDeliverectMenu("rest_deliverect_test", {
      items: [
        {
          menuId: "menu_lunch",
          menu: "Lunch",
          categories: [
            {
              name: "Bowls",
              products: [
                {
                  plu: "bowl_001",
                  name: "Chicken Bowl",
                  description: "Rice, chicken, and greens",
                  price: 1299,
                  status: "available",
                  modifierGroups: [
                    {
                      id: "sauce_group",
                      name: "Sauce",
                      min: 0,
                      max: 2,
                      modifiers: [
                        {
                          plu: "sauce_hot",
                          name: "Hot Sauce",
                          price: 50,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        restaurantId: "rest_deliverect_test",
        category: "Bowls",
        name: "Chicken Bowl",
        description: "Rice, chicken, and greens",
        priceCents: 1299,
        availability: "available",
        mappingStatus: "mapped",
        posRef: {
          provider: "deliverect",
          externalId: "bowl_001",
        },
      }),
    ]);
    expect(result.modifierGroups).toEqual([
      expect.objectContaining({
        restaurantId: "rest_deliverect_test",
        name: "Sauce",
        selectionType: "multi",
        minSelections: 0,
        maxSelections: 2,
      }),
    ]);
    expect(result.modifiers).toEqual([
      expect.objectContaining({
        name: "Hot Sauce",
        priceCents: 50,
        isAvailable: true,
      }),
    ]);
    expect(result.mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalType: "item",
          provider: "deliverect",
          providerReference: "bowl_001",
          status: "mapped",
        }),
        expect.objectContaining({
          canonicalType: "modifier",
          providerReference: "sauce_hot",
        }),
      ]),
    );
  });

  it("marks products without provider references as needing review", () => {
    const result = normalizeDeliverectMenu("rest_deliverect_test", {
      items: [
        {
          products: [
            {
              name: "Mystery Item",
              price: 1000,
            },
          ],
        },
      ],
    });

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        name: "Mystery Item",
        mappingStatus: "needs_review",
      }),
    );
    expect(result.mappings[0]).toEqual(
      expect.objectContaining({
        canonicalType: "item",
        status: "needs_review",
      }),
    );
  });

  it("converts Deliverect Channel menu object maps and subProduct references", () => {
    const result = normalizeDeliverectMenu("rest_deliverect_test", [
      {
        channelLinkId: "channel_link_123",
        menuId: "menu_dinner",
        menu: "Dinner",
        categories: [
          {
            _id: "cat_burgers",
            name: "Burgers",
            subProducts: ["prod_burger"],
          },
        ],
        products: {
          prod_burger: {
            _id: "prod_burger",
            plu: "BURG-01",
            name: "Classic Burger",
            description: "Patty, bun, lettuce",
            price: 1599,
            productType: 1,
            subProducts: ["group_cheese"],
          },
        },
        modifierGroups: {
          group_cheese: {
            _id: "group_cheese",
            plu: "MOD-CHEESE",
            name: "Cheese",
            min: 0,
            max: 1,
            productType: 3,
            subProducts: ["mod_cheddar"],
          },
        },
        modifiers: {
          mod_cheddar: {
            _id: "mod_cheddar",
            plu: "CHED-01",
            name: "Cheddar",
            price: 100,
            productType: 2,
          },
        },
      },
    ]);

    expect(result.items).toEqual([
      expect.objectContaining({
        category: "Burgers",
        name: "Classic Burger",
        priceCents: 1599,
        posRef: expect.objectContaining({ externalId: "BURG-01" }),
      }),
    ]);
    expect(result.modifierGroups).toEqual([
      expect.objectContaining({
        name: "Cheese",
        selectionType: "single",
        maxSelections: 1,
      }),
    ]);
    expect(result.modifiers).toEqual([
      expect.objectContaining({
        name: "Cheddar",
        priceCents: 100,
      }),
    ]);
    expect(result.mappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ canonicalType: "item", providerReference: "BURG-01" }),
        expect.objectContaining({ canonicalType: "modifier_group", providerReference: "group_cheese" }),
        expect.objectContaining({ canonicalType: "modifier", providerReference: "CHED-01" }),
      ]),
    );
  });

  it("treats Deliverect Channel max zero as an unlimited multi-select group", () => {
    const result = normalizeDeliverectMenu("rest_deliverect_test", [
      {
        channelLinkId: "channel_link_123",
        menuId: "menu_dinner",
        menu: "Dinner",
        categories: [
          {
            _id: "cat_sides",
            name: "Sides",
            subProducts: ["prod_sate"],
          },
        ],
        products: {
          prod_sate: {
            _id: "prod_sate",
            plu: "P-SATE",
            name: "Chicken Sate",
            price: 1350,
            productType: 1,
            subProducts: ["group_rice"],
          },
        },
        modifierGroups: {
          group_rice: {
            _id: "group_rice",
            plu: "MG-RICE",
            name: "Rice Selection",
            min: 0,
            max: 0,
            multiMax: 99,
            productType: 3,
            subProducts: ["mod_yellow_rice"],
          },
        },
        modifiers: {
          mod_yellow_rice: {
            _id: "mod_yellow_rice",
            plu: "RICE-02",
            name: "Yellow Rice",
            price: 450,
            productType: 2,
          },
        },
      },
    ]);

    expect(result.modifierGroups).toEqual([
      expect.objectContaining({
        name: "Rice Selection",
        selectionType: "multi",
        minSelections: 0,
        maxSelections: null,
      }),
    ]);
    expect(result.modifiers).toEqual([
      expect.objectContaining({
        name: "Yellow Rice",
        priceCents: 450,
      }),
    ]);
  });
});
