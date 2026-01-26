import React from 'react';
import { Shield } from 'lucide-react';

// Standalone component that doesn't require authentication
export default function PrivacyPolicy() {
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
      privacyPolicy: 'Privacy Policy',
      privacyPolicyIntroduction: 'Introduction',
      privacyPolicyIntroductionText: 'Welcome to Ascent ("we," "our," or "us"). We are committed to protecting your privacy and ensuring the security of your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our financial management application.',
      informationWeCollect: 'Information We Collect',
      informationWeCollectText: 'We collect information that you provide directly to us, including:',
      personalInfoCollection: 'Personal information such as your name, email address, and profile information',
      financialDataCollection: 'Financial data including account information, transactions, budgets, and investment positions',
      preferencesCollection: 'User preferences and settings',
      usageDataCollection: 'Usage data and analytics to improve our services',
      howWeUseInformation: 'How We Use Your Information',
      howWeUseInformationText: 'We use the information we collect to:',
      provideServices: 'Provide, maintain, and improve our services',
      processTransactions: 'Process and manage your financial transactions and data',
      sendNotifications: 'Send you notifications, updates, and summaries (if enabled)',
      customerSupport: 'Respond to your inquiries and provide customer support',
      securityCompliance: 'Ensure security and prevent fraud',
      dataSecurity: 'Data Security',
      dataSecurityText: 'We implement appropriate technical and organizational security measures to protect your personal information. This includes encryption, secure data storage, and access controls. However, no method of transmission over the internet is 100% secure.',
      dataSharing: 'Data Sharing',
      dataSharingText: 'We do not sell your personal information. We may share your information only in the following circumstances:',
      withConsent: 'With your explicit consent',
      sharedUsers: 'With users you have explicitly granted access to (shared accounts)',
      legalRequirements: 'To comply with legal obligations',
      serviceProviders: 'With trusted service providers who assist in operating our services (under strict confidentiality agreements)',
      yourRights: 'Your Rights',
      yourRightsText: 'You have the right to:',
      accessData: 'Access and review your personal information',
      updateData: 'Update or correct your information',
      deleteData: 'Request deletion of your account and data',
      optOut: 'Opt out of certain communications',
      cookiesAndTracking: 'Cookies and Tracking',
      cookiesAndTrackingText: 'We use cookies and similar tracking technologies to enhance your experience, analyze usage patterns, and improve our services. You can control cookie preferences through your browser settings.',
      thirdPartyServices: 'Third-Party Services',
      thirdPartyServicesText: 'Our application may integrate with third-party services (such as Google OAuth for authentication). These services have their own privacy policies, and we encourage you to review them.',
      childrenPrivacy: "Children's Privacy",
      childrenPrivacyText: 'Our services are not intended for individuals under the age of 18. We do not knowingly collect personal information from children.',
      changesToPolicy: 'Changes to This Privacy Policy',
      changesToPolicyText: 'We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date.',
      contactUsPrivacyText: 'If you have any questions about this Privacy Policy or our data practices, please contact us through the application settings or support channels.',
    };
    return translations[key] || key;
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 ${colors.bgPrimary}`}>
      <div className="max-w-4xl mx-auto py-8">
        <div className={`rounded-xl border p-6 md:p-8 ${colors.cardBg} ${colors.cardBorder}`}>
          <div className="flex items-center gap-3 mb-6">
            <Shield className="w-6 h-6 text-[#5C8374]" />
            <h1 className={`text-3xl font-bold ${colors.textPrimary}`}>
              {t('privacyPolicy')}
            </h1>
          </div>

          <div className={`prose prose-invert max-w-none ${colors.textPrimary}`}>
            <p className={`text-sm mb-4 ${colors.textTertiary}`}>
              <strong>Last Updated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('privacyPolicyIntroduction')}
              </h2>
              <p className={`mb-4 ${colors.textSecondary}`}>
                {t('privacyPolicyIntroductionText')}
              </p>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('informationWeCollect')}
              </h2>
              <p className={`mb-2 ${colors.textSecondary}`}>
                {t('informationWeCollectText')}
              </p>
              <ul className={`list-disc list-inside space-y-2 mb-4 ml-4 ${colors.textSecondary}`}>
                <li>{t('personalInfoCollection')}</li>
                <li>{t('financialDataCollection')}</li>
                <li>{t('preferencesCollection')}</li>
                <li>{t('usageDataCollection')}</li>
              </ul>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('howWeUseInformation')}
              </h2>
              <p className={`mb-2 ${colors.textSecondary}`}>
                {t('howWeUseInformationText')}
              </p>
              <ul className={`list-disc list-inside space-y-2 mb-4 ml-4 ${colors.textSecondary}`}>
                <li>{t('provideServices')}</li>
                <li>{t('processTransactions')}</li>
                <li>{t('sendNotifications')}</li>
                <li>{t('customerSupport')}</li>
                <li>{t('securityCompliance')}</li>
              </ul>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('dataSecurity')}
              </h2>
              <p className={`mb-4 ${colors.textSecondary}`}>
                {t('dataSecurityText')}
              </p>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('dataSharing')}
              </h2>
              <p className={`mb-4 ${colors.textSecondary}`}>
                {t('dataSharingText')}
              </p>
              <ul className={`list-disc list-inside space-y-2 mb-4 ml-4 ${colors.textSecondary}`}>
                <li>{t('withConsent')}</li>
                <li>{t('sharedUsers')}</li>
                <li>{t('legalRequirements')}</li>
                <li>{t('serviceProviders')}</li>
              </ul>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('yourRights')}
              </h2>
              <p className={`mb-2 ${colors.textSecondary}`}>
                {t('yourRightsText')}
              </p>
              <ul className={`list-disc list-inside space-y-2 mb-4 ml-4 ${colors.textSecondary}`}>
                <li>{t('accessData')}</li>
                <li>{t('updateData')}</li>
                <li>{t('deleteData')}</li>
                <li>{t('exportData')}</li>
                <li>{t('optOut')}</li>
              </ul>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('cookiesAndTracking')}
              </h2>
              <p className={`mb-4 ${colors.textSecondary}`}>
                {t('cookiesAndTrackingText')}
              </p>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('thirdPartyServices')}
              </h2>
              <p className={`mb-4 ${colors.textSecondary}`}>
                {t('thirdPartyServicesText')}
              </p>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('childrenPrivacy')}
              </h2>
              <p className={`mb-4 ${colors.textSecondary}`}>
                {t('childrenPrivacyText')}
              </p>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                {t('changesToPolicy')}
              </h2>
              <p className={`mb-4 ${colors.textSecondary}`}>
                {t('changesToPolicyText')}
              </p>
            </section>

            <section className="mb-6">
              <h2 className={`text-xl font-semibold mb-3 ${colors.textPrimary}`}>
                Contact Us
              </h2>
              <p className={`mb-4 ${colors.textSecondary}`}>
                {t('contactUsPrivacyText')}
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
