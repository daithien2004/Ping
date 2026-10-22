'use client';

import {
  ErrorCodes,
  createServerSchema,
  joinServerSchema,
  type CreateServerInput,
  type JoinServerInput,
} from '@ping/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingForm, PingFormItem, usePingForm, zodFormRules } from '@/components/ui/ping-form';
import { PingInput } from '@/components/ui/ping-input';
import { PingModal } from '@/components/ui/ping-modal';
import { PingRadioGroup } from '@/components/ui/ping-radio-group';
import { PingSteps } from '@/components/ui/ping-steps';
import { useErrorMessage } from '@/lib/error-message';
import { useCreateServer, useJoinServer } from '../hooks';
import { channelPath, serverPath } from '../navigation';

export type OnboardingMode = 'create' | 'join';

/**
 * Wizard onboarding (TF.8): hai bước — chọn cách bắt đầu (tạo server hay tham gia bằng mã mời)
 * rồi điền chi tiết. Mở với `initialMode` thì bỏ qua bước 1.
 */
export function OnboardingWizard({
  open,
  initialMode,
  onClose,
}: {
  open: boolean;
  initialMode?: OnboardingMode;
  onClose: () => void;
}) {
  const t = useTranslations('servers');
  return (
    <PingModal
      open={open}
      onCancel={onClose}
      title={t('wizard.title')}
      footer={null}
      destroyOnHidden
    >
      {open ? <OnboardingContent initialMode={initialMode} onClose={onClose} /> : null}
    </PingModal>
  );
}

function OnboardingContent({
  initialMode,
  onClose,
}: {
  initialMode?: OnboardingMode;
  onClose: () => void;
}) {
  const router = useRouter();
  const t = useTranslations('servers');
  const [step, setStep] = useState(initialMode ? 1 : 0);
  const [mode, setMode] = useState<OnboardingMode>(initialMode ?? 'create');
  const createMutation = useCreateServer();
  const joinMutation = useJoinServer();
  const errorMessage = useErrorMessage();
  const [createForm] = usePingForm<CreateServerInput>();
  const [joinForm] = usePingForm<JoinServerInput>();
  const createRules = zodFormRules(createServerSchema, () => createForm.getFieldsValue());
  const joinRules = zodFormRules(joinServerSchema, () => joinForm.getFieldsValue());
  // Ô nhập đầu tiên của bước chi tiết (chỉ một trong hai nhánh được render).
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Bước chi tiết mới sinh ra ô nhập nên phải tự đưa con trỏ vào (dialog đã mở ở bước 1).
  // Dùng focus() thay cho autoFocus để không vi phạm jsx-a11y/no-autofocus (ADR-0029).
  useEffect(() => {
    if (step === 1) firstFieldRef.current?.focus();
  }, [step, mode]);

  function close() {
    createMutation.reset();
    joinMutation.reset();
    createForm.resetFields();
    joinForm.resetFields();
    onClose();
  }

  return (
    <>
      <PingSteps
        size="small"
        current={step}
        className="mb-4"
        items={[{ title: t('wizard.chooseStep') }, { title: t('wizard.detailStep') }]}
      />

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <PingRadioGroup
            value={mode}
            onChange={(event) => setMode(event.target.value as OnboardingMode)}
            options={[
              { label: t('wizard.chooseCreate'), value: 'create' },
              { label: t('wizard.chooseJoin'), value: 'join' },
            ]}
          />
          <div className="flex justify-end">
            <PingButton onClick={() => setStep(1)}>{t('wizard.continue')}</PingButton>
          </div>
        </div>
      )}

      {step === 1 && mode === 'create' && (
        <PingForm
          form={createForm}
          layout="vertical"
          noValidate
          onFinish={(values) => {
            const parsed = createServerSchema.safeParse(values);
            if (!parsed.success) return;
            createMutation.mutate(parsed.data, {
              onSuccess: (server) => {
                close();
                const general = server.channels[0];
                router.push(general ? channelPath(server.id, general.id) : serverPath(server.id));
              },
            });
          }}
        >
          <PingFormItem label={t('name')} name="name" rules={createRules.name}>
            <PingInput ref={firstFieldRef} autoComplete="off" />
          </PingFormItem>
          {createMutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(createMutation.error)}
            </p>
          )}
          <WizardActions
            onBack={() => (initialMode ? close() : setStep(0))}
            pending={createMutation.isPending}
            submitLabel={t('create')}
          />
        </PingForm>
      )}

      {step === 1 && mode === 'join' && (
        <PingForm
          form={joinForm}
          layout="vertical"
          noValidate
          onFinish={(values) => {
            const parsed = joinServerSchema.safeParse(values);
            if (!parsed.success) return;
            joinMutation.mutate(parsed.data, {
              onSuccess: ({ server }) => {
                close();
                router.push(serverPath(server.id));
              },
            });
          }}
        >
          <PingFormItem label={t('inviteCode')} name="inviteCode" rules={joinRules.inviteCode}>
            <PingInput ref={firstFieldRef} autoComplete="off" />
          </PingFormItem>
          {joinMutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(joinMutation.error, {
                [ErrorCodes.NOT_FOUND]: t('invalidInvite'),
                [ErrorCodes.CONFLICT]: t('alreadyMember'),
              })}
            </p>
          )}
          <WizardActions
            onBack={() => (initialMode ? close() : setStep(0))}
            pending={joinMutation.isPending}
            submitLabel={t('joinSubmit')}
          />
        </PingForm>
      )}
    </>
  );
}

function WizardActions({
  onBack,
  pending,
  submitLabel,
}: {
  onBack: () => void;
  pending: boolean;
  submitLabel: string;
}) {
  const t = useTranslations('servers');
  return (
    <div className="mt-2 flex items-center justify-between">
      <PingButton variant="ghost" onClick={onBack}>
        {t('wizard.back')}
      </PingButton>
      <PingButton htmlType="submit" loading={pending}>
        {submitLabel}
      </PingButton>
    </div>
  );
}
