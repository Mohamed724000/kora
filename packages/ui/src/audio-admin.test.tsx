import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ActionableError,
  ActionButton,
  ContentForm,
  ContentFormField,
  ContentStatusBadge,
  MediaProcessingStatus,
  PublicationChecklist,
} from './index';

describe('primitives administration du pilote audio', () => {
  it('structure un formulaire clair avec actions explicites', () => {
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());

    render(
      <ContentForm
        actions={
          <>
            <ActionButton variant="secondary">Enregistrer le brouillon</ActionButton>
            <ActionButton type="submit">Continuer</ActionButton>
          </>
        }
        description="Renseignez les métadonnées publiques."
        onSubmit={onSubmit}
        title="Nouveau contenu audio"
      >
        <ContentFormField inputId="title" label="Titre public" required>
          <input id="title" name="title" />
        </ContentFormField>
      </ContentForm>,
    );

    expect(screen.getByRole('heading', { name: 'Nouveau contenu audio' })).toBeInTheDocument();
    const titleInput = screen.getByLabelText(/Titre public/);
    expect(titleInput).toBeInTheDocument();
    fireEvent.change(titleInput, { target: { value: 'Voix du fleuve' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('relie aide, erreur et obligation au controle de formulaire', () => {
    render(
      <ContentFormField
        description="Nom visible dans le catalogue."
        error="Le titre est obligatoire."
        inputId="catalog-title"
        label="Titre public"
        required
      >
        <input name="title" />
      </ContentFormField>,
    );

    const input = screen.getByRole('textbox', { name: /Titre public/ });
    expect(input).toHaveAttribute('id', 'catalog-title');
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute(
      'aria-describedby',
      'catalog-title-description catalog-title-error',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Le titre est obligatoire.');
  });

  it('distingue chaque statut par un symbole et un libellé', () => {
    render(
      <>
        <ContentStatusBadge status="draft" />
        <ContentStatusBadge status="processing" />
        <ContentStatusBadge status="ready" />
        <ContentStatusBadge status="published" />
        <ContentStatusBadge status="archived" />
        <ContentStatusBadge status="error" />
      </>,
    );

    for (const label of ['Brouillon', 'Traitement', 'Prêt', 'Publié', 'Archivé', 'Erreur']) {
      expect(screen.getByLabelText(`Statut : ${label}`)).toBeInTheDocument();
    }
  });

  it('annonce la progression média sans prétendre que le contenu est publié', () => {
    render(
      <MediaProcessingStatus
        detail="Transcodage de la version privée en cours."
        progress={64}
        state="processing"
      />,
    );

    expect(screen.getByRole('progressbar', { name: 'Traitement effectué à 64 %' })).toHaveAttribute(
      'aria-valuenow',
      '64',
    );
    expect(screen.queryByText('Publié')).not.toBeInTheDocument();
  });

  it('rend la checklist compréhensible sans dépendre de la couleur', () => {
    render(
      <PublicationChecklist
        items={[
          { complete: true, id: 'metadata', label: 'Métadonnées complètes' },
          { complete: false, id: 'media', label: 'Média prêt' },
        ]}
      />,
    );

    expect(screen.getByText('1 sur 2 étapes terminées')).toBeInTheDocument();
    expect(screen.getByText(/Métadonnées complètes/).parentElement).toHaveTextContent('terminé');
    expect(screen.getByText(/Média prêt/).parentElement).toHaveTextContent('à terminer');
  });

  it('associe chaque instance de checklist à un titre ARIA unique', () => {
    const { container } = render(
      <>
        <PublicationChecklist
          items={[{ complete: true, id: 'metadata', label: 'Métadonnées complètes' }]}
        />
        <PublicationChecklist items={[{ complete: false, id: 'media', label: 'Média prêt' }]} />
      </>,
    );

    const checklists = [...container.querySelectorAll('section[aria-labelledby]')];
    const titleIds = checklists.map((checklist) => checklist.getAttribute('aria-labelledby'));

    expect(checklists).toHaveLength(2);
    expect(new Set(titleIds).size).toBe(2);
    for (const titleId of titleIds) {
      expect(titleId).toBeTruthy();
      expect(document.getElementById(titleId!)).toHaveTextContent('Checklist de publication');
    }
  });

  it('associe une erreur actionnable à une action clavier native', () => {
    const retry = vi.fn();
    render(
      <ActionableError
        action={<ActionButton onClick={retry}>Relancer la préparation</ActionButton>}
        detail="Le fichier source reste privé et intact."
        title="La préparation a échoué"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('La préparation a échoué');
    fireEvent.click(screen.getByRole('button', { name: 'Relancer la préparation' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
