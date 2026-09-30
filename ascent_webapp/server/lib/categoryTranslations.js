// Category name translations
export const categoryTranslations = {
  // Expense categories
  food_dining: {
    en: 'Food & Dining',
    he: 'אוכל ומסעדות',
    ru: 'Еда и рестораны'
  },
  groceries: {
    en: 'Groceries',
    he: 'מכולת',
    ru: 'Продукты'
  },
  transportation: {
    en: 'Transportation',
    he: 'תחבורה',
    ru: 'Транспорт'
  },
  utilities: {
    en: 'Utilities',
    he: 'חשבונות שוטפים',
    ru: 'Коммунальные услуги'
  },
  rent_housing: {
    en: 'Rent & Housing',
    he: 'שכירות ודיור',
    ru: 'Аренда и жилье'
  },
  healthcare: {
    en: 'Healthcare',
    he: 'בריאות',
    ru: 'Здравоохранение'
  },
  entertainment: {
    en: 'Entertainment',
    he: 'בידור',
    ru: 'Развлечения'
  },
  shopping: {
    en: 'Shopping',
    he: 'קניות',
    ru: 'Покупки'
  },
  insurance: {
    en: 'Insurance',
    he: 'ביטוח',
    ru: 'Страхование'
  },
  education: {
    en: 'Education',
    he: 'חינוך',
    ru: 'Образование'
  },
  personal_care: {
    en: 'Personal Care',
    he: 'טיפוח אישי',
    ru: 'Личный уход'
  },
  subscriptions: {
    en: 'Subscriptions',
    he: 'מנויים',
    ru: 'Подписки'
  },
  travel: {
    en: 'Travel',
    he: 'נסיעות',
    ru: 'Путешествия'
  },
  gifts: {
    en: 'Gifts',
    he: 'מתנות',
    ru: 'Подарки'
  },
  taxes: {
    en: 'Taxes',
    he: 'מיסים',
    ru: 'Налоги'
  },
  other_expense: {
    en: 'Other',
    he: 'אחר',
    ru: 'Другое'
  },
  
  // Income categories
  salary: {
    en: 'Salary',
    he: 'משכורת',
    ru: 'Зарплата'
  },
  freelance: {
    en: 'Freelance',
    he: 'פרילנס',
    ru: 'Фриланс'
  },
  investments: {
    en: 'Investment Income',
    he: 'הכנסות מהשקעות',
    ru: 'Инвестиционный доход'
  },
  rental_income: {
    en: 'Rental Income',
    he: 'הכנסות משכירות',
    ru: 'Доход от аренды'
  },
  gifts_received: {
    en: 'Gifts Received',
    he: 'מתנות שהתקבלו',
    ru: 'Полученные подарки'
  },
  refunds: {
    en: 'Refunds',
    he: 'החזרים',
    ru: 'Возвраты'
  },
  other_income: {
    en: 'Other Income',
    he: 'הכנסה אחרת',
    ru: 'Другой доход'
  },
};

// Get translated category name
export function translateCategoryName(nameOrKey, language = 'en') {
  // Check if it's a translation key
  if (categoryTranslations[nameOrKey]) {
    return categoryTranslations[nameOrKey][language] || categoryTranslations[nameOrKey].en || nameOrKey;
  }
  
  // If not a key, check if the name itself matches any translation
  for (const [key, translations] of Object.entries(categoryTranslations)) {
    if (Object.values(translations).includes(nameOrKey)) {
      return translations[language] || translations.en;
    }
  }
  
  // Return as-is if no translation found
  return nameOrKey;
}

// Get all categories for a specific type and language
export function getDefaultCategories(type = 'Expense', language = 'en') {
  return Object.entries(categoryTranslations)
    .filter(([key]) => {
      if (type === 'Expense') {
        return !['salary', 'freelance', 'investments', 'rental_income', 'gifts_received', 'refunds', 'other_income'].includes(key);
      } else if (type === 'Income') {
        return ['salary', 'freelance', 'investments', 'rental_income', 'gifts_received', 'refunds', 'other_income'].includes(key);
      }
      return true;
    })
    .map(([key, translations]) => ({
      key,
      name: translations[language] || translations.en
    }));
}

export default { translateCategoryName, getDefaultCategories, categoryTranslations };

