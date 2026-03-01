"""HRM (Human Resource Management) models."""
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from core.models import TimeStampedModel


# ---------------------------------------------------------------------------
# Organisation
# ---------------------------------------------------------------------------

class Department(TimeStampedModel):
    """Departement au sein d'une entreprise."""

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="hrm_departments",
        verbose_name="entreprise",
    )
    name = models.CharField("nom", max_length=150)
    code = models.CharField("code", max_length=30, blank=True, default="")
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="children",
        verbose_name="departement parent",
    )
    head = models.ForeignKey(
        "Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="headed_departments",
        verbose_name="responsable",
    )
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        verbose_name = "departement"
        unique_together = [("enterprise", "name")]
        ordering = ["name"]

    def __str__(self):
        return self.name


class Position(TimeStampedModel):
    """Poste / fonction dans l'entreprise."""

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="hrm_positions",
        verbose_name="entreprise",
    )
    title = models.CharField("intitule", max_length=200)
    code = models.CharField("code", max_length=30, blank=True, default="")
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="positions",
        verbose_name="departement",
    )
    min_salary = models.DecimalField(
        "salaire minimum",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    max_salary = models.DecimalField(
        "salaire maximum",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        verbose_name = "poste"
        unique_together = [("enterprise", "title")]
        ordering = ["title"]

    def __str__(self):
        return self.title


# ---------------------------------------------------------------------------
# Employee
# ---------------------------------------------------------------------------

class Employee(TimeStampedModel):
    """Employe rattache a une entreprise et eventuellement a un user Django."""

    class Gender(models.TextChoices):
        MALE = "M", "Masculin"
        FEMALE = "F", "Feminin"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Actif"
        ON_LEAVE = "ON_LEAVE", "En conge"
        SUSPENDED = "SUSPENDED", "Suspendu"
        TERMINATED = "TERMINATED", "Licencie"
        RESIGNED = "RESIGNED", "Demissionnaire"

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="hrm_employees",
        verbose_name="entreprise",
    )
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hrm_employee",
        verbose_name="compte utilisateur",
    )
    employee_number = models.CharField(
        "matricule",
        max_length=30,
        db_index=True,
    )
    first_name = models.CharField("prenom", max_length=150)
    last_name = models.CharField("nom", max_length=150)
    gender = models.CharField(
        "genre",
        max_length=1,
        choices=Gender.choices,
        blank=True,
        default="",
    )
    date_of_birth = models.DateField("date de naissance", null=True, blank=True)
    national_id = models.CharField("numero CNI / passeport", max_length=50, blank=True, default="")
    phone = models.CharField("telephone", max_length=30, blank=True, default="")
    email = models.EmailField("e-mail", blank=True, default="")
    address = models.TextField("adresse", blank=True, default="")
    photo = models.ImageField("photo", upload_to="hrm/employees/", blank=True)

    # Poste & organisation
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employees",
        verbose_name="departement",
    )
    position = models.ForeignKey(
        Position,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employees",
        verbose_name="poste",
    )
    manager = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="direct_reports",
        verbose_name="superieur hierarchique",
    )
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hrm_employees",
        verbose_name="boutique d'affectation",
    )

    hire_date = models.DateField("date d'embauche", null=True, blank=True)
    termination_date = models.DateField("date de fin", null=True, blank=True)
    status = models.CharField(
        "statut",
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )

    # Paie
    base_salary = models.DecimalField(
        "salaire de base",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    bank_name = models.CharField("banque", max_length=100, blank=True, default="")
    bank_account = models.CharField("numero de compte", max_length=50, blank=True, default="")

    # Contact d'urgence
    emergency_contact_name = models.CharField(
        "contact d'urgence — nom", max_length=150, blank=True, default=""
    )
    emergency_contact_phone = models.CharField(
        "contact d'urgence — telephone", max_length=30, blank=True, default=""
    )

    class Meta:
        verbose_name = "employe"
        unique_together = [("enterprise", "employee_number")]
        ordering = ["last_name", "first_name"]

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.employee_number})"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()


# ---------------------------------------------------------------------------
# Contract
# ---------------------------------------------------------------------------

class Contract(TimeStampedModel):
    """Contrat de travail lie a un employe."""

    class ContractType(models.TextChoices):
        CDI = "CDI", "CDI"
        CDD = "CDD", "CDD"
        STAGE = "STAGE", "Stage"
        INTERIM = "INTERIM", "Interim"
        FREELANCE = "FREELANCE", "Freelance"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Brouillon"
        ACTIVE = "ACTIVE", "Actif"
        EXPIRED = "EXPIRED", "Expire"
        TERMINATED = "TERMINATED", "Resilie"

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="contracts",
        verbose_name="employe",
    )
    contract_type = models.CharField(
        "type de contrat",
        max_length=20,
        choices=ContractType.choices,
    )
    reference = models.CharField("reference", max_length=50, blank=True, default="")
    start_date = models.DateField("date de debut")
    end_date = models.DateField("date de fin", null=True, blank=True)
    salary = models.DecimalField(
        "salaire mensuel",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    position = models.ForeignKey(
        Position,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="poste",
    )
    status = models.CharField(
        "statut",
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    notes = models.TextField("notes", blank=True, default="")
    document = models.FileField(
        "document",
        upload_to="hrm/contracts/",
        blank=True,
    )

    class Meta:
        verbose_name = "contrat"
        ordering = ["-start_date"]

    def __str__(self):
        return f"{self.employee} — {self.contract_type} ({self.start_date})"


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------

class AttendancePolicy(TimeStampedModel):
    """Politique de presence (horaires, tolerances)."""

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="hrm_attendance_policies",
        verbose_name="entreprise",
    )
    name = models.CharField("nom", max_length=100)
    work_start = models.TimeField("heure de debut")
    work_end = models.TimeField("heure de fin")
    break_minutes = models.PositiveIntegerField("pause (minutes)", default=60)
    late_tolerance_minutes = models.PositiveIntegerField("tolerance retard (min)", default=15)
    is_default = models.BooleanField("par defaut", default=False)

    class Meta:
        verbose_name = "politique de presence"
        unique_together = [("enterprise", "name")]

    def __str__(self):
        return self.name


class Attendance(TimeStampedModel):
    """Pointage journalier d'un employe."""

    class Status(models.TextChoices):
        PRESENT = "PRESENT", "Present"
        ABSENT = "ABSENT", "Absent"
        LATE = "LATE", "En retard"
        HALF_DAY = "HALF_DAY", "Demi-journee"
        ON_LEAVE = "ON_LEAVE", "En conge"
        HOLIDAY = "HOLIDAY", "Jour ferie"

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="attendances",
        verbose_name="employe",
    )
    date = models.DateField("date", db_index=True)
    check_in = models.DateTimeField("heure d'arrivee", null=True, blank=True)
    check_out = models.DateTimeField("heure de depart", null=True, blank=True)
    status = models.CharField(
        "statut",
        max_length=20,
        choices=Status.choices,
        default=Status.PRESENT,
    )
    late_minutes = models.PositiveIntegerField("minutes de retard", default=0)
    overtime_minutes = models.PositiveIntegerField("heures supplementaires (min)", default=0)
    notes = models.TextField("notes", blank=True, default="")
    policy = models.ForeignKey(
        AttendancePolicy,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="politique appliquee",
    )

    class Meta:
        verbose_name = "pointage"
        unique_together = [("employee", "date")]
        ordering = ["-date"]
        indexes = [
            models.Index(fields=["employee", "date"]),
        ]

    def __str__(self):
        return f"{self.employee} — {self.date} ({self.status})"


# ---------------------------------------------------------------------------
# Leave
# ---------------------------------------------------------------------------

class LeaveType(TimeStampedModel):
    """Type de conge (annuel, maladie, maternite, etc.)."""

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="hrm_leave_types",
        verbose_name="entreprise",
    )
    name = models.CharField("nom", max_length=100)
    code = models.CharField("code", max_length=20, blank=True, default="")
    default_days = models.PositiveIntegerField("jours par defaut / an", default=0)
    is_paid = models.BooleanField("conge paye", default=True)
    requires_document = models.BooleanField("justificatif requis", default=False)
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        verbose_name = "type de conge"
        unique_together = [("enterprise", "name")]
        ordering = ["name"]

    def __str__(self):
        return self.name


class LeaveBalance(TimeStampedModel):
    """Solde de conges d'un employe pour un type donne et une annee."""

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="leave_balances",
        verbose_name="employe",
    )
    leave_type = models.ForeignKey(
        LeaveType,
        on_delete=models.CASCADE,
        related_name="balances",
        verbose_name="type de conge",
    )
    year = models.PositiveIntegerField("annee")
    allocated = models.DecimalField(
        "jours alloues",
        max_digits=6,
        decimal_places=1,
        default=Decimal("0.0"),
    )
    used = models.DecimalField(
        "jours utilises",
        max_digits=6,
        decimal_places=1,
        default=Decimal("0.0"),
    )
    carried_over = models.DecimalField(
        "jours reportes",
        max_digits=6,
        decimal_places=1,
        default=Decimal("0.0"),
    )

    class Meta:
        verbose_name = "solde de conges"
        unique_together = [("employee", "leave_type", "year")]

    @property
    def remaining(self):
        return self.allocated + self.carried_over - self.used

    def __str__(self):
        return f"{self.employee} — {self.leave_type} {self.year}: {self.remaining}j"


class LeaveRequest(TimeStampedModel):
    """Demande de conge soumise par un employe."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "En attente"
        APPROVED = "APPROVED", "Approuvee"
        REJECTED = "REJECTED", "Refusee"
        CANCELLED = "CANCELLED", "Annulee"

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="leave_requests",
        verbose_name="employe",
    )
    leave_type = models.ForeignKey(
        LeaveType,
        on_delete=models.PROTECT,
        related_name="requests",
        verbose_name="type de conge",
    )
    start_date = models.DateField("date de debut")
    end_date = models.DateField("date de fin")
    days_requested = models.DecimalField(
        "jours demandes",
        max_digits=6,
        decimal_places=1,
    )
    reason = models.TextField("motif", blank=True, default="")
    status = models.CharField(
        "statut",
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    reviewed_by = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="leave_reviews",
        verbose_name="revue par",
    )
    reviewed_at = models.DateTimeField("date de revue", null=True, blank=True)
    review_comment = models.TextField("commentaire de revue", blank=True, default="")
    document = models.FileField(
        "justificatif",
        upload_to="hrm/leaves/",
        blank=True,
    )

    class Meta:
        verbose_name = "demande de conge"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.employee} — {self.leave_type} ({self.start_date} → {self.end_date})"


# ---------------------------------------------------------------------------
# Payroll
# ---------------------------------------------------------------------------

class PayrollPeriod(TimeStampedModel):
    """Periode de paie (mensuelle)."""

    class Status(models.TextChoices):
        OPEN = "OPEN", "Ouverte"
        PROCESSING = "PROCESSING", "En cours"
        CLOSED = "CLOSED", "Cloturee"

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="hrm_payroll_periods",
        verbose_name="entreprise",
    )
    label = models.CharField("libelle", max_length=50)
    start_date = models.DateField("date de debut")
    end_date = models.DateField("date de fin")
    status = models.CharField(
        "statut",
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
        db_index=True,
    )
    closed_at = models.DateTimeField("cloturee le", null=True, blank=True)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="cloturee par",
    )

    class Meta:
        verbose_name = "periode de paie"
        unique_together = [("enterprise", "start_date", "end_date")]
        ordering = ["-start_date"]

    def __str__(self):
        return self.label


class PaySlip(TimeStampedModel):
    """Bulletin de paie d'un employe pour une periode donnee."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Brouillon"
        VALIDATED = "VALIDATED", "Valide"
        PAID = "PAID", "Paye"

    period = models.ForeignKey(
        PayrollPeriod,
        on_delete=models.CASCADE,
        related_name="payslips",
        verbose_name="periode",
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name="payslips",
        verbose_name="employe",
    )
    base_salary = models.DecimalField(
        "salaire de base",
        max_digits=14,
        decimal_places=2,
    )
    gross_salary = models.DecimalField(
        "salaire brut",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    total_deductions = models.DecimalField(
        "total retenues",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    net_salary = models.DecimalField(
        "salaire net",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    status = models.CharField(
        "statut",
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    paid_at = models.DateTimeField("paye le", null=True, blank=True)
    notes = models.TextField("notes", blank=True, default="")

    class Meta:
        verbose_name = "bulletin de paie"
        unique_together = [("period", "employee")]
        ordering = ["-period__start_date"]

    def __str__(self):
        return f"{self.employee} — {self.period.label}"


class PaySlipLine(TimeStampedModel):
    """Ligne de detail d'un bulletin de paie (prime, retenue, etc.)."""

    class LineType(models.TextChoices):
        EARNING = "EARNING", "Gain"
        DEDUCTION = "DEDUCTION", "Retenue"

    payslip = models.ForeignKey(
        PaySlip,
        on_delete=models.CASCADE,
        related_name="lines",
        verbose_name="bulletin",
    )
    line_type = models.CharField(
        "type",
        max_length=20,
        choices=LineType.choices,
    )
    label = models.CharField("libelle", max_length=150)
    amount = models.DecimalField(
        "montant",
        max_digits=14,
        decimal_places=2,
    )
    sort_order = models.PositiveIntegerField("ordre", default=0)

    class Meta:
        verbose_name = "ligne de bulletin"
        ordering = ["sort_order", "line_type"]

    def __str__(self):
        return f"{self.label}: {self.amount}"


class SalaryComponent(TimeStampedModel):
    """Composant de salaire reutilisable (prime, cotisation, etc.)."""

    class ComponentType(models.TextChoices):
        EARNING = "EARNING", "Gain"
        DEDUCTION = "DEDUCTION", "Retenue"

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="hrm_salary_components",
        verbose_name="entreprise",
    )
    name = models.CharField("nom", max_length=150)
    code = models.CharField("code", max_length=30, blank=True, default="")
    component_type = models.CharField(
        "type",
        max_length=20,
        choices=ComponentType.choices,
    )
    is_taxable = models.BooleanField("imposable", default=True)
    is_fixed = models.BooleanField("montant fixe", default=True)
    default_amount = models.DecimalField(
        "montant par defaut",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    default_percentage = models.DecimalField(
        "pourcentage par defaut",
        max_digits=6,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        verbose_name = "composant de salaire"
        unique_together = [("enterprise", "name")]
        ordering = ["name"]

    def __str__(self):
        return self.name


class EmployeeSalaryComponent(TimeStampedModel):
    """Affectation d'un composant de salaire a un employe."""

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="salary_components",
        verbose_name="employe",
    )
    component = models.ForeignKey(
        SalaryComponent,
        on_delete=models.CASCADE,
        related_name="employee_assignments",
        verbose_name="composant",
    )
    amount = models.DecimalField(
        "montant",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    percentage = models.DecimalField(
        "pourcentage",
        max_digits=6,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        verbose_name = "composant employe"
        unique_together = [("employee", "component")]

    def __str__(self):
        return f"{self.employee} — {self.component}"


# ---------------------------------------------------------------------------
# Performance
# ---------------------------------------------------------------------------

class EvaluationTemplate(TimeStampedModel):
    """Modele d'evaluation de performance."""

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="hrm_evaluation_templates",
        verbose_name="entreprise",
    )
    name = models.CharField("nom", max_length=150)
    description = models.TextField("description", blank=True, default="")
    is_active = models.BooleanField("actif", default=True)

    class Meta:
        verbose_name = "modele d'evaluation"
        unique_together = [("enterprise", "name")]
        ordering = ["name"]

    def __str__(self):
        return self.name


class EvaluationCriteria(TimeStampedModel):
    """Critere d'evaluation lie a un modele."""

    template = models.ForeignKey(
        EvaluationTemplate,
        on_delete=models.CASCADE,
        related_name="criteria",
        verbose_name="modele",
    )
    label = models.CharField("libelle", max_length=200)
    weight = models.DecimalField(
        "poids (%)",
        max_digits=5,
        decimal_places=2,
        default=Decimal("1.00"),
    )
    sort_order = models.PositiveIntegerField("ordre", default=0)

    class Meta:
        verbose_name = "critere d'evaluation"
        verbose_name_plural = "criteres d'evaluation"
        ordering = ["sort_order"]

    def __str__(self):
        return self.label


class PerformanceReview(TimeStampedModel):
    """Evaluation de performance d'un employe."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Brouillon"
        SUBMITTED = "SUBMITTED", "Soumise"
        COMPLETED = "COMPLETED", "Terminee"

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="performance_reviews",
        verbose_name="employe",
    )
    template = models.ForeignKey(
        EvaluationTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="modele",
    )
    reviewer = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviews_given",
        verbose_name="evaluateur",
    )
    period_label = models.CharField("periode", max_length=50, blank=True, default="")
    review_date = models.DateField("date d'evaluation", default=timezone.now)
    overall_score = models.DecimalField(
        "note globale",
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
    )
    status = models.CharField(
        "statut",
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    comments = models.TextField("commentaires", blank=True, default="")
    employee_comments = models.TextField(
        "commentaires de l'employe", blank=True, default=""
    )

    class Meta:
        verbose_name = "evaluation de performance"
        ordering = ["-review_date"]

    def __str__(self):
        return f"{self.employee} — {self.period_label}"


class PerformanceReviewScore(TimeStampedModel):
    """Note par critere pour une evaluation."""

    review = models.ForeignKey(
        PerformanceReview,
        on_delete=models.CASCADE,
        related_name="scores",
        verbose_name="evaluation",
    )
    criteria = models.ForeignKey(
        EvaluationCriteria,
        on_delete=models.CASCADE,
        verbose_name="critere",
    )
    score = models.DecimalField(
        "note",
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0"))],
    )
    comment = models.TextField("commentaire", blank=True, default="")

    class Meta:
        verbose_name = "note de critere"
        unique_together = [("review", "criteria")]


# ---------------------------------------------------------------------------
# Discipline
# ---------------------------------------------------------------------------

class DisciplinaryAction(TimeStampedModel):
    """Action disciplinaire (avertissement, sanction, etc.)."""

    class Severity(models.TextChoices):
        VERBAL_WARNING = "VERBAL_WARNING", "Avertissement verbal"
        WRITTEN_WARNING = "WRITTEN_WARNING", "Avertissement ecrit"
        SUSPENSION = "SUSPENSION", "Mise a pied"
        TERMINATION = "TERMINATION", "Licenciement"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Ouvert"
        ACKNOWLEDGED = "ACKNOWLEDGED", "Pris en compte"
        RESOLVED = "RESOLVED", "Resolu"
        APPEALED = "APPEALED", "En appel"

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="disciplinary_actions",
        verbose_name="employe",
    )
    severity = models.CharField(
        "gravite",
        max_length=30,
        choices=Severity.choices,
    )
    incident_date = models.DateField("date de l'incident")
    description = models.TextField("description de l'incident")
    action_taken = models.TextField("mesure prise", blank=True, default="")
    status = models.CharField(
        "statut",
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
        db_index=True,
    )
    issued_by = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="disciplinary_actions_issued",
        verbose_name="emis par",
    )
    document = models.FileField(
        "document",
        upload_to="hrm/discipline/",
        blank=True,
    )
    resolved_at = models.DateTimeField("resolu le", null=True, blank=True)

    class Meta:
        verbose_name = "action disciplinaire"
        ordering = ["-incident_date"]

    def __str__(self):
        return f"{self.employee} — {self.severity} ({self.incident_date})"


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

class EmployeeDocument(TimeStampedModel):
    """Document RH attache a un employe (CV, certificat, etc.)."""

    class DocType(models.TextChoices):
        CV = "CV", "CV"
        ID_CARD = "ID_CARD", "Piece d'identite"
        DIPLOMA = "DIPLOMA", "Diplome"
        CERTIFICATE = "CERTIFICATE", "Certificat"
        MEDICAL = "MEDICAL", "Certificat medical"
        CONTRACT = "CONTRACT", "Contrat"
        OTHER = "OTHER", "Autre"

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="documents",
        verbose_name="employe",
    )
    doc_type = models.CharField(
        "type",
        max_length=20,
        choices=DocType.choices,
        default=DocType.OTHER,
    )
    title = models.CharField("titre", max_length=200)
    file = models.FileField("fichier", upload_to="hrm/documents/")
    expiry_date = models.DateField("date d'expiration", null=True, blank=True)
    notes = models.TextField("notes", blank=True, default="")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="telecharge par",
    )

    class Meta:
        verbose_name = "document employe"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.employee} — {self.title}"


# ---------------------------------------------------------------------------
# Holiday Calendar
# ---------------------------------------------------------------------------

class Holiday(TimeStampedModel):
    """Jour ferie d'entreprise."""

    enterprise = models.ForeignKey(
        "stores.Enterprise",
        on_delete=models.CASCADE,
        related_name="hrm_holidays",
        verbose_name="entreprise",
    )
    name = models.CharField("nom", max_length=150)
    date = models.DateField("date", db_index=True)
    is_recurring = models.BooleanField("recurrent chaque annee", default=False)

    class Meta:
        verbose_name = "jour ferie"
        unique_together = [("enterprise", "date")]
        ordering = ["date"]

    def __str__(self):
        return f"{self.name} ({self.date})"
