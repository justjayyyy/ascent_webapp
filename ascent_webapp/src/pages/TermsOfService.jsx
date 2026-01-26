import React from 'react';
import { FileText } from 'lucide-react';

// Standalone component that doesn't require authentication
export default function TermsOfService() {
  // Use default dark theme colors for public page
  const colors = {
    bgPrimary: 'bg-[#092635]',
    cardBg: 'bg-[#1B4242]',
    cardBorder: 'border-[#5C8374]/20',
    textPrimary: 'text-white',
    textSecondary: 'text-[#9EC8B9]',
    textTertiary: 'text-[#5C8374]',
    accentText: 'text-[#9EC8B9]',
  };

  // Simple translation function (fallback to English)
  const t = (key) => {
    const translations = {
      termsOfService: 'Terms of Service',
      termsIntroduction: 'Introduction',
      termsIntroductionText: 'Welcome to Ascent. These Terms of Service ("Terms") govern your access to and use of our financial management application and services ("Service"). By accessing or using our Service, you agree to be bound by these Terms.',
      acceptanceOfTerms: 'Acceptance of Terms',
      acceptanceOfTermsText: 'By creating an account, accessing, or using our Service, you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy. If you do not agree to these Terms, you may not use our Service.',
      eligibility: 'Eligibility',
      eligibilityText: 'You must be at least 18 years old to use our Service. By using our Service, you represent and warrant that you are of legal age to form a binding contract and meet all eligibility requirements.',
      accountRegistration: 'Account Registration',
      accountRegistrationText: 'To use our Service, you must:',
      provideAccurateInfo: 'Provide accurate, current, and complete information during registration',
      maintainAccountSecurity: 'Maintain and update your account information to keep it accurate',
      protectCredentials: 'Maintain the security of your account credentials',
      notifyUnauthorized: 'Notify us immediately of any unauthorized access or use of your account',
      useOfService: 'Use of Service',
      useOfServiceText: 'You agree to use our Service only for lawful purposes and in accordance with these Terms. You agree not to:',
      violateLaws: 'Violate any applicable laws or regulations',
      infringeRights: 'Infringe upon the rights of others',
      transmitHarmful: 'Transmit any harmful, malicious, or illegal content',
      interfereService: 'Interfere with or disrupt the Service or servers',
      attemptUnauthorized: 'Attempt to gain unauthorized access to any part of the Service',
      financialData: 'Financial Data and Information',
      financialDataText: 'You are solely responsible for the accuracy of all financial data and information you enter into the Service. We are not responsible for any errors, omissions, or inaccuracies in your data. The Service is provided for informational and organizational purposes only and should not be considered as financial, investment, or tax advice.',
      sharedAccounts: 'Shared Accounts',
      sharedAccountsText: 'If you share your account with other users, you are responsible for managing permissions and access levels. You acknowledge that shared users will have access to your financial data according to the permissions you grant. We are not responsible for any actions taken by shared users.',
      intellectualProperty: 'Intellectual Property',
      intellectualPropertyText: 'The Service and its original content, features, and functionality are owned by Ascent and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws. You may not reproduce, distribute, modify, or create derivative works of the Service without our express written permission.',
      disclaimers: 'Disclaimers',
      disclaimersText: 'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE. WE ARE NOT RESPONSIBLE FOR ANY FINANCIAL DECISIONS MADE BASED ON INFORMATION PROVIDED BY THE SERVICE.',
      limitationOfLiability: 'Limitation of Liability',
      limitationOfLiabilityText: 'TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES.',
      termination: 'Termination',
      terminationText: 'We reserve the right to terminate or suspend your account and access to the Service immediately, without prior notice, for any reason, including if you breach these Terms. You may also terminate your account at any time through the application settings.',
      changesToTerms: 'Changes to Terms',
      changesToTermsText: 'We reserve the right to modify these Terms at any time. We will notify you of any material changes by posting the updated Terms on this page and updating the "Last Updated" date. Your continued use of the Service after such changes constitutes acceptance of the new Terms.',
      governingLaw: 'Governing Law',
      governingLawText: 'These Terms shall be governed by and construed in accordance with applicable laws, without regard to its conflict of law provisions.',
      contactUsTermsText: 'If you have any questions about these Terms of Service, please contact us through the application settings or support channels.',
    };
    return translations[key] || key;
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 ${colors.bgPrimary}`}>
      <div className="max-w-4xl mx-auto py-8">
        <div className={`rounded-xl border p-6 md:p-8 ${colors.cardBg} ${colors.cardBorder}`}>
          <div className="flex items-center gap-3 mb-6">
            <FileText className="w-6 h-6 text-[#5C8374]" />
            <h1 className={`text-3xl font-bold ${colors.textPrimary}`}>
              {t('termsOfService')}
            </h1>
          </div>

          <div className={`prose prose-invert max-w-none ${colors.textPrimary}`}>
            <p className={`text-sm mb-4 ${colors.textTertiary}`}>
              <strong>Last Updated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('termsIntroduction')}
              </h2>
              <p className={`mb-4 ${colors.textSecondary}`}>
                {t('termsIntroductionText')}
              </p>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('acceptanceOfTerms')}
              </h2>
              <p className={`mb-4 ${colors.textSecondary}`}>
                {t('acceptanceOfTermsText')}
              </p>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('eligibility')}
              </h2>
              <p className={`mb-4 ${colors.textSecondary}`}>
                {t('eligibilityText')}
              </p>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('accountRegistration')}
              </h2>
              <p className={`mb-2 ${colors.textSecondary}`}>
                {t('accountRegistrationText')}
              </p>
              <ul className={`list-disc list-inside space-y-2 mb-4 ml-4 ${colors.textSecondary}`}>
                <li>{t('provideAccurateInfo')}</li>
                <li>{t('maintainAccountSecurity')}</li>
                <li>{t('protectCredentials')}</li>
                <li>{t('notifyUnauthorized')}</li>
              </ul>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('useOfService')}
              </h2>
              <p className={`mb-2 ${colors.textSecondary}`}>
                {t('useOfServiceText')}
              </p>
              <ul className={`list-disc list-inside space-y-2 mb-4 ml-4 ${colors.textSecondary}`}>
                <li>{t('violateLaws')}</li>
                <li>{t('infringeRights')}</li>
                <li>{t('transmitHarmful')}</li>
                <li>{t('interfereService')}</li>
                <li>{t('attemptUnauthorized')}</li>
              </ul>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('financialData')}
              </h2>
              <p className={`mb-4 ${colors.textSecondary}`}>
                {t('financialDataText')}
              </p>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('sharedAccounts')}
              </h2>
              <p className={`mb-4 ${colors.textSecondary}`}>
                {t('sharedAccountsText')}
              </p>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('intellectualProperty')}
              </h2>
              <p className={`mb-4 ${colors.textSecondary}`}>
                {t('intellectualPropertyText')}
              </p>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('disclaimers')}
              </h2>
              <p className={`mb-4 ${colors.textSecondary}`}>
                {t('disclaimersText')}
              </p>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('limitationOfLiability')}
              </h2>
              <p className={`mb-4 ${colors.textSecondary}`}>
                {t('limitationOfLiabilityText')}
              </p>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('termination')}
              </h2>
              <p className={`mb-4 ${colors.textSecondary}`}>
                {t('terminationText')}
              </p>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('changesToTerms')}
              </h2>
              <p className={`mb-4 ${colors.textSecondary}`}>
                {t('changesToTermsText')}
              </p>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('governingLaw')}
              </h2>
              <p className={`mb-4 ${colors.textSecondary}`}>
                {t('governingLawText')}
              </p>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                Contact Us
              </h2>
              <p className={`mb-4 ${colors.textSecondary}`}>
                {t('contactUsTermsText')}
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
