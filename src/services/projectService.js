const {
    Project,
    ProjectUser,
} = require("../models");

async function getProjectsForUser(user) {
    if (user.role === "owner") {
        return Project.findAll({
            where: {
                isActive: true,
            },
            order: [
                ["name", "ASC"],
            ],
        });
    }

    return Project.findAll({
        where: {
            isActive: true,
        },

        include: [
            {
                model: ProjectUser,
                as: "users",
                where: {
                    userId: user.id,
                },
                attributes: [],
            },
        ],

        order: [
            ["name", "ASC"],
        ],
    });
}

async function getProjectForUser(
    projectId,
    user
) {
    const project =
        await Project.findOne({
            where: {
                id: projectId,
                isActive: true,
            },
        });

    if (!project) {
        return null;
    }

    if (user.role === "owner") {
        return project;
    }

    const access =
        await ProjectUser.findOne({
            where: {
                projectId: project.id,
                userId: user.id,
            },
        });

    return access
        ? project
        : null;
}

module.exports = {
    getProjectsForUser,
    getProjectForUser,
};