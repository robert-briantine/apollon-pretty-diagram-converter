export interface A {
    debut: string
    fin: string
    label: string
}
export interface Forme {
    type: "losange" | "rectangle" | "ovale"
    dx: number
    dy: number
    label: string
}

type Sommets = { [name: string]: Forme }

export interface Pas {
    type: "horizontal" | "vertical"
    distance: number
}
export interface Chemin {
    debut: string
    fin: string
    idx: number
    listeDePas: Pas[]
}
export interface Graphe {
    sommets: Sommets
    arretes: A[]
}
export interface SpaceGraphe {
    sommets: { [name: string]: Placement }
    chemins: Chemin[]
}
export interface Point {
    x: number
    y: number
}
export function calculerDestination(p: Point, listePas: Pas[]): Point {
    const r: Point = { ...p }
    listePas.forEach((pas) => {
        if (pas.type === "horizontal") {
            r.x += pas.distance
        } else {
            r.y += pas.distance
        }

    })
    return r
}

export function verifierChemin(sg:SpaceGraphe, espilon: number): Chemin[] {
    const erreurs: Chemin[] = []
    for (const c of sg.chemins) {
        const debut: Point = sg.sommets[c.debut].connexions[c.idx]
        const connexions: Point[] = sg.sommets[c.fin].connexions
        const fin = calculerDestination(debut, c.listeDePas)

        if (connexions.every((p) => {
            const dx = fin.x - p.x
            const dy = fin.y - p.y
            return ((dx * dx + dy * dy) > espilon)
        })) {
            erreurs.push(c)

        }
    }
    return erreurs
}
export interface Placement {
    p: Point
    forme: Forme
    connexions: Point[]
}
export function verifierPlacement(sg:SpaceGraphe ): [string, string][] {
    const r: [string, string][] = []
    const set: Set<string> = new Set()
    for (const a in sg.sommets) {
        set.add(a)
        for (const b in sg.sommets) {
            if (!set.has(b) && intersection(sg.sommets[a], sg.sommets[b])) {
                r.push([a, b])
            }
        }
    }



    return r

}
export function intersection(p: Placement, q: Placement) {

    if (p.p.x > q.p.x + q.forme.dx) {
        return false
    }

    if (p.p.x + p.forme.dx < q.p.x) {
        return false
    }
    if (p.p.y > q.p.y + q.forme.dy) {
        return false
    }

    if (p.p.y + p.forme.dy < q.p.y) {
        return false
    }
    return true

}

/**
 * Retourne true si le segment [p, q] intersecte l'intérieur du rectangle
 * défini par (x, y, largeur, hauteur). Les points sur le bord ne comptent
 * pas comme intersection (on utilise des inégalités strictes).
 */
export function segmentIntersecteRectangle(
    p: Point,
    q: Point,
    x: number,
    y: number,
    largeur: number,
    hauteur: number
): boolean {
    // Cas trivial : les deux extrémités sont à l'extérieur et le segment
    // est axis-aligned → on peut vérifier directement.
    const xMax = x + largeur
    const yMax = y + hauteur

    // Si le segment est entièrement à gauche, à droite, au-dessus ou en
    // dessous du rectangle → pas d'intersection.
    if (Math.max(p.x, q.x) <= x || Math.min(p.x, q.x) >= xMax) return false
    if (Math.max(p.y, q.y) <= y || Math.min(p.y, q.y) >= yMax) return false

    // Au moins une extrémité est dans le rectangle → intersection.
    const dansP = p.x > x && p.x < xMax && p.y > y && p.y < yMax
    const dansQ = q.x > x && q.x < xMax && q.y > y && q.y < yMax
    if (dansP || dansQ) return true

    // Les deux extrémités sont à l'extérieur : on vérifie si le segment
    // coupe un des quatre côtés du rectangle.
    const cotes = [
        { x1: x, y1: y, x2: xMax, y2: y },       // haut
        { x1: x, y1: yMax, x2: xMax, y2: yMax },  // bas
        { x1: x, y1: y, x2: x, y2: yMax },        // gauche
        { x1: xMax, y1: y, x2: xMax, y2: yMax },   // droite
    ]
    for (const c of cotes) {
        const c1 = { x: c.x1, y: c.y1 }
        const c2 = { x: c.x2, y: c.y2 }
        if (segmentsSeCroisent(p, q, c1, c2)) return true
    }
    return false
}

/** Teste si deux segments [a,b] et [c,d] se croisent (sans compter le cas où ils se touchent aux extrémités). */
function segmentsSeCroisent(a: Point, b: Point, c: Point, d: Point): boolean {
    const orient = (o: Point, p: Point, q: Point) => {
        const val = (q.y - o.y) * (p.x - o.x) - (p.y - o.y) * (q.x - o.x)
        if (val === 0) return 0
        return val > 0 ? 1 : 2
    }
    const o1 = orient(a, b, c)
    const o2 = orient(a, b, d)
    const o3 = orient(c, d, a)
    const o4 = orient(c, d, b)
    if (o1 !== o2 && o3 !== o4) return true
    // Collinéarité : on exclut le contact aux extrémités.
    if (o1 === 0 && pointSurSegment(a, c, b)) return true
    if (o2 === 0 && pointSurSegment(a, d, b)) return true
    if (o3 === 0 && pointSurSegment(c, a, d)) return true
    if (o4 === 0 && pointSurSegment(c, b, d)) return true
    return false
}

/** Vrai si le point p est strictement à l'intérieur du segment [a, b]. */
function pointSurSegment(a: Point, p: Point, b: Point): boolean {
    return (
        p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) &&
        p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)
    )
}

/**
 * Vérifie qu'aucun chemin ne traverse un placement qui n'est ni sa source
 * ni sa destination. Retourne la liste des paires [idChemin, idPlacement]
 * en conflit. Un tableau vide signifie que tout est propre.
 */
export function verifierPlacementChemin(sg: SpaceGraphe): Array<[string, string]> {
    const conflits: Array<[string, string]> = []
    for (const c of sg.chemins) {
        // On reconstruit les segments du chemin (chaque pas = un segment).
        let courant: Point = sg.sommets[c.debut].connexions[c.idx]
        for (const pas of c.listeDePas) {
            const suivant: Point = {
                x: courant.x + (pas.type === "horizontal" ? pas.distance : 0),
                y: courant.y + (pas.type === "vertical" ? pas.distance : 0),
            }
            // Pour chaque placement qui n'est ni la source ni la cible,
            // on teste si le segment [courant, suivant] le traverse.
            for (const [nom, pl] of Object.entries(sg.sommets)) {
                if (nom === c.debut || nom === c.fin) continue
                if (
                    segmentIntersecteRectangle(
                        courant,
                        suivant,
                        pl.p.x,
                        pl.p.y,
                        pl.forme.dx,
                        pl.forme.dy
                    )
                ) {
                    conflits.push([c.debut + "->" + c.fin, nom])
                }
            }
            courant = suivant
        }
    }
    return conflits
}

declare function computeSpatialGraphe(g: Graphe): SpaceGraphe
